import 'server-only';

import { eq, inArray, or } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { blocks, pendingNotifications, profiles } from '@/lib/db/schema';
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
 * constraint + onConflictDoNothing make repeated calls safe. A Server
 * Action retry or a double-click on submit can't produce duplicate emails.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getsaathi.com';

function routeLabel(route: string[]): string {
  return route.join(' → ');
}

/**
 * Find matches for `newTrip`, build notification payloads, and insert
 * pending_notifications rows — one per (matched user × active channel).
 *
 * Returns the count of rows inserted (dedupes silently skipped by the
 * unique constraint don't appear in the count).
 */
export async function enqueueMatchNotifications(
  newTrip: NewTripInfo,
): Promise<{ enqueued: number; matched: number }> {
  const matches = await findMatchingTrips(newTrip);
  if (matches.length === 0) return { enqueued: 0, matched: 0 };

  return withService(async (tx) => {
    // Poster display name — rendered into the payload so the dispatch
    // worker doesn't have to re-fetch at send time.
    const posterRows = await tx
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, newTrip.user_id))
      .limit(1);
    const posterName = posterRows[0]?.displayName ?? 'Someone';

    // Unique recipient user_ids from matched trips (one user may own
    // multiple matching trips — we notify once, not per trip).
    const candidateIds = Array.from(new Set(matches.map((m) => m.user_id)));

    // Filter out any block relationship with the poster — symmetric.
    // If either the poster blocked a candidate OR a candidate blocked the
    // poster, that candidate doesn't receive a notification. Closes bug M07
    // at the enqueue layer (RLS enforces the same on match_request inserts
    // and message sends; this prevents the inbox noise separately).
    const blockRows = await tx
      .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
      .from(blocks)
      .where(or(eq(blocks.blockerId, newTrip.user_id), eq(blocks.blockedId, newTrip.user_id)));

    const forbidden = new Set<string>();
    for (const b of blockRows) {
      forbidden.add(b.blockerId === newTrip.user_id ? b.blockedId : b.blockerId);
    }
    const recipientIds = candidateIds.filter((id) => !forbidden.has(id));
    if (recipientIds.length === 0) return { enqueued: 0, matched: matches.length };

    // Fetch contact channels for each recipient. A user with no email
    // AND no whatsapp number gets zero pending rows — nothing to send.
    const recipientProfiles = await tx
      .select({
        id: profiles.id,
        email: profiles.email,
        whatsappNumber: profiles.whatsappNumber,
      })
      .from(profiles)
      .where(inArray(profiles.id, recipientIds));
    if (recipientProfiles.length === 0) return { enqueued: 0, matched: matches.length };

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
      newTripId: string;
      recipientUserId: string;
      channel: PendingNotificationChannel;
      payload: PendingNotificationPayload;
    }> = [];
    for (const p of recipientProfiles) {
      if (p.email) {
        rows.push({
          newTripId: newTrip.id,
          recipientUserId: p.id,
          channel: 'email',
          payload,
        });
      }
      if (whatsappEnabled && p.whatsappNumber) {
        rows.push({
          newTripId: newTrip.id,
          recipientUserId: p.id,
          channel: 'whatsapp',
          payload,
        });
      }
    }

    if (rows.length === 0) return { enqueued: 0, matched: matches.length };

    // onConflictDoNothing handles the unique (new_trip, recipient, channel)
    // constraint: a duplicate (same trip re-enqueued by a retrying action)
    // silently skips the insert rather than erroring. `.returning({id})`
    // gives us the count of actually-inserted rows (skipped rows return
    // nothing).
    try {
      const inserted = await tx
        .insert(pendingNotifications)
        .values(rows)
        .onConflictDoNothing({
          target: [
            pendingNotifications.newTripId,
            pendingNotifications.recipientUserId,
            pendingNotifications.channel,
          ],
        })
        .returning({ id: pendingNotifications.id });

      const count = inserted.length;
      console.log(`[notify:enqueue] enqueued ${count} rows for trip ${newTrip.id}`);
      return { enqueued: count, matched: matches.length };
    } catch (err) {
      console.error('[notify:enqueue] insert failed:', (err as Error).message);
      return { enqueued: 0, matched: matches.length };
    }
  });
}
