import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sendMatchDigestEmail } from '@/lib/email';
import type { PendingNotificationPayload, PendingNotificationsRow } from '@/types/db';

/**
 * Dispatch worker for the notification queue (see 0017 migration).
 *
 * Called from two places:
 *   1. `after()` in the trip-post Server Action — best-effort immediate
 *      drain so first-time recipients get email within seconds.
 *   2. `/api/cron/send-notifications` on a 1-minute Vercel Cron — picks
 *      up anything `after()` dropped and handles cooldown-released
 *      backlog.
 *
 * Core behaviours (bug M03 / M04):
 *   * Claims rows atomically via `claim_pending_notifications` rpc
 *     (FOR UPDATE SKIP LOCKED — safe under concurrent workers).
 *   * Per-recipient cooldown: skips a recipient whose
 *     profiles.last_notified_at is within the cooldown window.
 *     Skipped rows go back to pending with a delayed next_attempt_at,
 *     so they're retried after the cooldown lifts.
 *   * Aggregation: groups claimed rows by recipient and sends ONE
 *     digest email per recipient per cycle. A burst of 50 matches on a
 *     popular route collapses to a single email per recipient.
 *   * Freshness gate: re-queries each row's trip.status before sending.
 *     A row whose trip was cancelled becomes 'skipped', not 'sent'.
 *   * Exponential backoff on transient send failures; permanent fail
 *     after 5 attempts (enforced in the claim rpc).
 */

/** Don't spam a recipient more often than this. */
const COOLDOWN_MINUTES = 10;

/** How many pending rows to claim per wake-up. */
const BATCH_SIZE = 100;

/** Backoff schedule (minutes) keyed by attempt count (1-indexed). */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

interface DispatchResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  deferred: number;
}

export async function dispatchPendingNotifications(
  batchSize: number = BATCH_SIZE,
): Promise<DispatchResult> {
  const supabase = createSupabaseServiceClient();

  // ── 1. Claim a batch atomically ────────────────────────────────────
  const { data: claimed, error: claimError } = await supabase.rpc('claim_pending_notifications', {
    batch_size: batchSize,
  });
  if (claimError) {
    Sentry.captureException(claimError, {
      tags: { scope: 'notify-dispatch', stage: 'claim' },
    });
    console.error('[notify:dispatch] claim failed:', claimError.message);
    return { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  }
  const rows = (claimed ?? []) as PendingNotificationsRow[];
  if (rows.length === 0) {
    return { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  }

  // ── 2. Freshness gate: exclude rows whose source trip is no longer open
  const tripIds = Array.from(new Set(rows.map((r) => r.new_trip_id)));
  const { data: tripStatuses } = await supabase
    .from('trips')
    .select('id, status')
    .in('id', tripIds);
  const openTripIds = new Set(
    (tripStatuses ?? []).filter((t) => t.status === 'open').map((t) => t.id),
  );

  // ── 3. Per-recipient cooldown check ────────────────────────────────
  const recipientIds = Array.from(new Set(rows.map((r) => r.recipient_user_id)));
  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, email, last_notified_at')
    .in('id', recipientIds);
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const recipientById = new Map<
    string,
    { email: string | null; last_notified_at: string | null }
  >();
  for (const r of recipients ?? []) {
    recipientById.set(r.id, {
      email: r.email,
      last_notified_at: r.last_notified_at,
    });
  }

  // ── 4. Bucket rows per recipient, applying gates ───────────────────
  type SortedRow = PendingNotificationsRow & { _bucket: 'send' | 'defer' | 'skip' | 'fail' };
  const byRecipient = new Map<string, SortedRow[]>();

  for (const row of rows) {
    let bucket: SortedRow['_bucket'] = 'send';

    // Gate 1: trip still open?
    if (!openTripIds.has(row.new_trip_id)) {
      bucket = 'skip';
    } else {
      const recipient = recipientById.get(row.recipient_user_id);
      // Gate 2: do we have a delivery address for this channel?
      if (row.channel === 'email' && !recipient?.email) {
        bucket = 'skip';
      } else if (
        row.channel === 'email' &&
        recipient?.last_notified_at &&
        recipient.last_notified_at > cooldownCutoff
      ) {
        // Gate 3: cooldown — defer this row past the cooldown window.
        bucket = 'defer';
      }
      // WhatsApp: no cooldown yet (template doesn't digest). Gated by
      // TWILIO_WHATSAPP_MATCH_CONTENT_SID at enqueue time. Left to
      // send individually until a digest template exists.
    }

    const list = byRecipient.get(row.recipient_user_id) ?? [];
    list.push({ ...row, _bucket: bucket });
    byRecipient.set(row.recipient_user_id, list);
  }

  // ── 5. Dispatch per recipient ──────────────────────────────────────
  const result: DispatchResult = {
    claimed: rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
  };

  for (const [recipientId, list] of byRecipient) {
    const recipient = recipientById.get(recipientId);
    const sendable = list.filter((r) => r._bucket === 'send' && r.channel === 'email');
    const deferRows = list.filter((r) => r._bucket === 'defer');
    const skipRows = list.filter((r) => r._bucket === 'skip');

    // 5a. Skip — mark and move on.
    for (const row of skipRows) {
      await markSkipped(supabase, row);
      result.skipped += 1;
    }

    // 5b. Defer — push next_attempt_at past the cooldown window. Keeps
    // them in the queue for a future dispatch cycle.
    for (const row of deferRows) {
      await markDeferred(supabase, row, COOLDOWN_MINUTES);
      result.deferred += 1;
    }

    // 5c. Send — one digest email per recipient with all sendable rows.
    if (sendable.length > 0 && recipient?.email) {
      try {
        const payloads = sendable.map((r) => r.payload as PendingNotificationPayload);
        const ok = await sendMatchDigestEmail(recipient.email, payloads);
        if (ok) {
          const ids = sendable.map((r) => r.id);
          const nowIso = new Date().toISOString();
          await supabase
            .from('pending_notifications')
            .update({ status: 'sent', sent_at: nowIso })
            .in('id', ids);
          await supabase
            .from('profiles')
            .update({ last_notified_at: nowIso })
            .eq('id', recipientId);
          result.sent += sendable.length;
        } else {
          for (const row of sendable) {
            await markFailed(supabase, row, 'send returned false');
            result.failed += 1;
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { scope: 'notify-dispatch', stage: 'send' },
          extra: { recipientId },
        });
        for (const row of sendable) {
          await markFailed(supabase, row, err instanceof Error ? err.message : 'unknown');
          result.failed += 1;
        }
      }
    }

    // 5d. WhatsApp rows — not batched yet. Intentionally unhandled in
    // this cycle; will be caught when the WhatsApp digest template ships.
    const whatsappRows = list.filter((r) => r._bucket === 'send' && r.channel === 'whatsapp');
    for (const row of whatsappRows) {
      // Keep them for a later pass by deferring a minute — so we don't
      // leave them in in_flight forever. Revisit when WhatsApp dispatch
      // lands.
      await markDeferred(supabase, row, 1);
      result.deferred += 1;
    }
  }

  return result;
}

// ── Row state transitions ──────────────────────────────────────────────

async function markSkipped(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: PendingNotificationsRow,
) {
  await supabase
    .from('pending_notifications')
    .update({ status: 'skipped', sent_at: new Date().toISOString() })
    .eq('id', row.id);
}

async function markDeferred(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: PendingNotificationsRow,
  delayMinutes: number,
) {
  // Push next_attempt_at past the cooldown. Reset status to 'pending'
  // so the next claim cycle picks it up. Don't count the deferral as a
  // failed attempt — the row's fine, it just arrived too soon.
  await supabase
    .from('pending_notifications')
    .update({
      status: 'pending',
      attempts: Math.max(0, row.attempts - 1),
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    })
    .eq('id', row.id);
}

async function markFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: PendingNotificationsRow,
  errorMessage: string,
) {
  const nextAttempts = row.attempts; // already bumped by claim rpc
  if (nextAttempts >= 5) {
    // Permanent fail.
    await supabase
      .from('pending_notifications')
      .update({ status: 'failed', last_error: errorMessage })
      .eq('id', row.id);
    return;
  }
  // Transient — back to pending with exponential backoff.
  const backoff = BACKOFF_MINUTES[Math.min(nextAttempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
  await supabase
    .from('pending_notifications')
    .update({
      status: 'pending',
      last_error: errorMessage,
      next_attempt_at: new Date(Date.now() + backoff * 60_000).toISOString(),
    })
    .eq('id', row.id);
}
