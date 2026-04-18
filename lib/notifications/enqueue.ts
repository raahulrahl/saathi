import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { findMatchingTrips, type NewTripInfo } from '@/lib/auto-match';
import type { PendingNotificationChannel, PendingNotificationPayload } from '@/types/db';

/**
 * Enqueue notifications for a newly-created trip.
 *
 * Replaces the old fire-and-forget `findAndNotifyMatches` — instead of
 * sending email/WhatsApp directly from the request path, we drop rows
 * into `pending_notifications` and let the dispatch worker (see
 * lib/notifications/dispatch.ts) deliver them with proper aggregation,
 * cooldown, and retries.
 *
 * Idempotent: the UNIQUE (new_trip_id, recipient_user_id, channel)
 * constraint + `onConflict` make repeated calls safe. A Server Action
 * retry or a double-click on submit can't produce duplicate emails.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getsaathi.com';

function routeLabel(route: string[]): string {
  return route.join(' → ');
}

/**
 * Find matches for `newTrip`, build notification payloads, and insert
 * pending_notifications rows — one per (matched user × active channel).
 *
 * Returns the count of rows inserted (including dedupes skipped by the
 * unique constraint — those return as "conflict, no row").
 */
export async function enqueueMatchNotifications(
  newTrip: NewTripInfo,
): Promise<{ enqueued: number; matched: number }> {
  const matches = await findMatchingTrips(newTrip);
  if (matches.length === 0) return { enqueued: 0, matched: 0 };

  const supabase = createSupabaseServiceClient();

  // Poster display name — rendered into the payload so the dispatch
  // worker doesn't have to re-fetch at send time.
  const { data: poster } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', newTrip.user_id)
    .maybeSingle();
  const posterName = poster?.display_name ?? 'Someone';

  // Unique recipient user_ids from matched trips (one user may own
  // multiple matching trips — we notify once, not per trip).
  const recipientIds = Array.from(new Set(matches.map((m) => m.user_id)));

  // Fetch contact channels for each recipient. A user with no email
  // AND no whatsapp number gets zero pending rows — nothing to send.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, whatsapp_number')
    .in('id', recipientIds);

  if (!profiles || profiles.length === 0) return { enqueued: 0, matched: matches.length };

  const payload: PendingNotificationPayload = {
    posterName,
    newTripKind: newTrip.kind,
    routeLabel: routeLabel(newTrip.route),
    travelDate: newTrip.travel_date,
    flightNumbers: newTrip.flight_numbers,
    tripUrl: `${SITE_URL}/trip/${newTrip.id}`,
  };

  // Build the rows we want to insert. Skip channels the recipient
  // hasn't given us — no email address = no pending email row.
  // The dispatch worker will aggregate across channels per recipient;
  // missing rows just mean that recipient won't get that channel.
  const whatsappEnabled = !!process.env.TWILIO_WHATSAPP_MATCH_CONTENT_SID;

  const rows: Array<{
    new_trip_id: string;
    recipient_user_id: string;
    channel: PendingNotificationChannel;
    payload: PendingNotificationPayload;
  }> = [];
  for (const p of profiles) {
    if (p.email) {
      rows.push({
        new_trip_id: newTrip.id,
        recipient_user_id: p.id,
        channel: 'email',
        payload,
      });
    }
    if (whatsappEnabled && p.whatsapp_number) {
      rows.push({
        new_trip_id: newTrip.id,
        recipient_user_id: p.id,
        channel: 'whatsapp',
        payload,
      });
    }
  }

  if (rows.length === 0) return { enqueued: 0, matched: matches.length };

  // ON CONFLICT DO NOTHING via ignoreDuplicates=true. PostgREST's
  // upsert semantics: with the unique constraint on (new_trip, recipient,
  // channel), a duplicate (same trip re-enqueued by a retrying action)
  // silently skips the insert rather than erroring. The `count: 'exact'`
  // gives us the real inserted-row count.
  const { data: inserted, error } = await supabase
    .from('pending_notifications')
    .upsert(rows, {
      onConflict: 'new_trip_id,recipient_user_id,channel',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    console.error('[notify:enqueue] insert failed:', error.message);
    return { enqueued: 0, matched: matches.length };
  }

  const count = inserted?.length ?? 0;
  console.log(`[notify:enqueue] enqueued ${count} rows for trip ${newTrip.id}`);
  return { enqueued: count, matched: matches.length };
}
