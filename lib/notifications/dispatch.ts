import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { eq, inArray, sql } from 'drizzle-orm';
import { withService, type DbTx } from '@/lib/db';
import { pendingNotifications, profiles, trips } from '@/lib/db/schema';
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

const COOLDOWN_MINUTES = 24 * 60;

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
  // ── 1. Claim a batch atomically ────────────────────────────────────
  let rows: PendingNotificationsRow[];
  try {
    rows = await withService(async (tx) => {
      // `tx.execute` is the escape hatch for arbitrary SQL. Drizzle types
      // it as Record<string,unknown>; we know the function returns rows
      // shaped like pending_notifications, so cast at the boundary.
      const claimed = await tx.execute(
        sql`select * from public.claim_pending_notifications(${batchSize})`,
      );
      return claimed as unknown as PendingNotificationsRow[];
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { scope: 'notify-dispatch', stage: 'claim' } });
    console.error('[notify:dispatch] claim failed:', (err as Error).message);
    return { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  }
  if (rows.length === 0) {
    return { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  }

  // The rest of the cycle batches reads + per-row writes. Keep it all in
  // a single withService — reads don't need a per-row transaction, and the
  // writes are independent enough that one tx is acceptable. (Each row's
  // status transition is idempotent given the claim rpc set status='in_flight'.)
  return withService(async (tx) => {
    // ── 2. Freshness gate: exclude rows whose source trip is no longer open
    const tripIds = Array.from(new Set(rows.map((r) => r.new_trip_id)));
    const tripStatuses = await tx
      .select({ id: trips.id, status: trips.status })
      .from(trips)
      .where(inArray(trips.id, tripIds));
    const openTripIds = new Set(tripStatuses.filter((t) => t.status === 'open').map((t) => t.id));

    // ── 3. Per-recipient cooldown check ────────────────────────────────
    const recipientIds = Array.from(new Set(rows.map((r) => r.recipient_user_id)));
    const recipients = await tx
      .select({
        id: profiles.id,
        email: profiles.email,
        lastNotifiedAt: profiles.lastNotifiedAt,
      })
      .from(profiles)
      .where(inArray(profiles.id, recipientIds));
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
    const recipientById = new Map<
      string,
      { email: string | null; last_notified_at: string | null }
    >();
    for (const r of recipients) {
      recipientById.set(r.id, {
        email: r.email,
        last_notified_at: r.lastNotifiedAt,
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
        await markSkipped(tx, row);
        result.skipped += 1;
      }

      // 5b. Defer — push next_attempt_at to the moment this recipient's
      // cooldown lifts, not a blanket cooldown-from-now.
      const lastNotifiedAt = recipient?.last_notified_at;
      const wakeAt = lastNotifiedAt
        ? new Date(new Date(lastNotifiedAt).getTime() + COOLDOWN_MINUTES * 60_000)
        : new Date(Date.now() + COOLDOWN_MINUTES * 60_000);
      for (const row of deferRows) {
        await markDeferredUntil(tx, row, wakeAt);
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
            await tx
              .update(pendingNotifications)
              .set({ status: 'sent', sentAt: nowIso })
              .where(inArray(pendingNotifications.id, ids));
            await tx
              .update(profiles)
              .set({ lastNotifiedAt: nowIso })
              .where(eq(profiles.id, recipientId));
            result.sent += sendable.length;
          } else {
            for (const row of sendable) {
              await markFailed(tx, row, 'send returned false');
              result.failed += 1;
            }
          }
        } catch (err) {
          Sentry.captureException(err, {
            tags: { scope: 'notify-dispatch', stage: 'send' },
            extra: { recipientId },
          });
          for (const row of sendable) {
            await markFailed(tx, row, err instanceof Error ? err.message : 'unknown');
            result.failed += 1;
          }
        }
      }

      // 5d. WhatsApp rows — not batched yet. Intentionally unhandled in
      // this cycle; will be caught when the WhatsApp digest template ships.
      const whatsappRows = list.filter((r) => r._bucket === 'send' && r.channel === 'whatsapp');
      const whatsappWakeAt = new Date(Date.now() + 60_000); // defer by 1 min
      for (const row of whatsappRows) {
        await markDeferredUntil(tx, row, whatsappWakeAt);
        result.deferred += 1;
      }
    }

    return result;
  });
}

// ── Row state transitions ──────────────────────────────────────────────

async function markSkipped(tx: DbTx, row: PendingNotificationsRow) {
  await tx
    .update(pendingNotifications)
    .set({ status: 'skipped', sentAt: new Date().toISOString() })
    .where(eq(pendingNotifications.id, row.id));
}

async function markDeferredUntil(tx: DbTx, row: PendingNotificationsRow, wakeAt: Date) {
  // Push next_attempt_at to an explicit wake time. Reset status to
  // 'pending' so the next claim cycle picks it up. Don't count the
  // deferral as a failed attempt — the row's fine, it just arrived
  // inside another recipient's cooldown.
  await tx
    .update(pendingNotifications)
    .set({
      status: 'pending',
      attempts: Math.max(0, row.attempts - 1),
      nextAttemptAt: wakeAt.toISOString(),
    })
    .where(eq(pendingNotifications.id, row.id));
}

async function markFailed(tx: DbTx, row: PendingNotificationsRow, errorMessage: string) {
  const nextAttempts = row.attempts; // already bumped by claim rpc
  if (nextAttempts >= 5) {
    // Permanent fail.
    await tx
      .update(pendingNotifications)
      .set({ status: 'failed', lastError: errorMessage })
      .where(eq(pendingNotifications.id, row.id));
    return;
  }
  // Transient — back to pending with exponential backoff.
  const backoff = BACKOFF_MINUTES[Math.min(nextAttempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
  await tx
    .update(pendingNotifications)
    .set({
      status: 'pending',
      lastError: errorMessage,
      nextAttemptAt: new Date(Date.now() + backoff * 60_000).toISOString(),
    })
    .where(eq(pendingNotifications.id, row.id));
}
