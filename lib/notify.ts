import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { findMatchingTrips, type NewTripInfo, type MatchedTrip } from '@/lib/auto-match';
import { sendMatchNotificationEmail, type MatchNotificationData } from '@/lib/email';

/**
 * Notification dispatcher: find matching trips and notify their owners.
 *
 * Called fire-and-forget from createTripAction — failures are logged but
 * never block trip creation.
 *
 * Channels:
 *   - Email via Resend: active now.
 *   - WhatsApp via Twilio: stubbed, gated behind TWILIO_WHATSAPP_MATCH_CONTENT_SID.
 *     Once Meta Business verification lands and a utility template is approved,
 *     set that env var to enable WhatsApp notifications.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getsaathi.com';

function routeLabel(route: string[]): string {
  return route.join(' → ');
}

/**
 * Send a WhatsApp notification for a trip match.
 *
 * Gated behind TWILIO_WHATSAPP_MATCH_CONTENT_SID — returns early if not
 * configured. Once Meta approves the utility template, set the env var
 * in Vercel and WhatsApp notifications go live.
 *
 * Template variables expected:
 *   {{1}} — poster display name
 *   {{2}} — route label (e.g. "DEL → AMS")
 *   {{3}} — travel date
 *   {{4}} — trip URL
 */
async function sendWhatsAppMatchNotification(
  whatsappNumber: string,
  data: MatchNotificationData,
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_MATCH_CONTENT_SID;

  if (!sid || !token || !from || !contentSid) {
    // WhatsApp match notifications not configured — skip silently.
    return false;
  }

  const to = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;

  const body = new URLSearchParams({
    To: to,
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({
      '1': data.posterName,
      '2': data.routeLabel,
      '3': data.travelDate,
      '4': data.tripUrl,
    }),
  });

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[notify:whatsapp] Twilio ${res.status}: ${text}`);
      return false;
    }

    console.log(`[notify:whatsapp] match notification sent to ${whatsappNumber}`);
    return true;
  } catch (err) {
    console.error('[notify:whatsapp] send failed:', err);
    return false;
  }
}

/**
 * Main entry point: find matching trips for a newly created trip
 * and notify each matched user via email (and WhatsApp when enabled).
 *
 * Fire-and-forget — never throws.
 */
export async function findAndNotifyMatches(newTrip: NewTripInfo): Promise<void> {
  const matches = await findMatchingTrips(newTrip);
  if (matches.length === 0) return;

  const supabase = createSupabaseServiceClient();

  // Fetch the new trip poster's display name for the notification.
  const { data: poster } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', newTrip.user_id)
    .maybeSingle();

  const posterName = poster?.display_name ?? 'Someone';

  // Collect unique user IDs from matched trips (one user might have
  // multiple matching trips — notify them once, not per trip).
  const userIds = Array.from(new Set(matches.map((m: MatchedTrip) => m.user_id)));

  // Fetch profiles for all matched users in one query.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, whatsapp_number')
    .in('id', userIds);

  if (!profiles || profiles.length === 0) return;

  const tripUrl = `${SITE_URL}/trip/${newTrip.id}`;
  const data: MatchNotificationData = {
    posterName,
    newTripKind: newTrip.kind,
    routeLabel: routeLabel(newTrip.route),
    travelDate: newTrip.travel_date,
    flightNumbers: newTrip.flight_numbers,
    tripUrl,
  };

  // Send notifications in parallel — one per matched user.
  const results = await Promise.allSettled(
    profiles.map(async (profile) => {
      const sent: string[] = [];

      // Email
      if (profile.email) {
        const ok = await sendMatchNotificationEmail(profile.email, data);
        if (ok) sent.push('email');
      }

      // WhatsApp (only if template is configured)
      if (profile.whatsapp_number) {
        const ok = await sendWhatsAppMatchNotification(profile.whatsapp_number, data);
        if (ok) sent.push('whatsapp');
      }

      if (sent.length > 0) {
        console.log(`[notify] ${profile.id}: sent via ${sent.join(', ')}`);
      } else {
        console.warn(`[notify] ${profile.id}: no channel delivered`);
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[notify] ${failed.length}/${results.length} notifications failed`);
  }
}
