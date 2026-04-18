import 'server-only';

import { Resend } from 'resend';

/**
 * Lightweight Resend wrapper for transactional email.
 *
 * Sends from "Saathi <hello@getsaathi.com>" — the domain must be
 * verified in the Resend dashboard for this to work. During local dev
 * without RESEND_API_KEY, calls are silently skipped with a console
 * warning so trip creation isn't blocked.
 */

const FROM = 'Saathi <hello@getsaathi.com>';

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resend = new Resend(key);
  return resend;
}

export interface MatchNotificationData {
  /** Display name of the person who just posted a trip. */
  posterName: string;
  /** 'request' or 'offer' — what the new trip is. */
  newTripKind: 'request' | 'offer';
  /** e.g. "DEL → AMS" */
  routeLabel: string;
  /** ISO date string, e.g. "2026-05-01" */
  travelDate: string;
  /** Flight numbers, e.g. ["KL872"] */
  flightNumbers: string[];
  /** Full URL to the new trip, e.g. "https://getsaathi.com/trip/{id}" */
  tripUrl: string;
}

/**
 * Send a "someone matched your flight" email.
 *
 * Returns true if the email was sent (or skipped in dev), false on error.
 * Never throws — callers should fire-and-forget.
 */
export async function sendMatchNotificationEmail(
  to: string,
  data: MatchNotificationData,
): Promise<boolean> {
  const client = getResend();
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set — skipping match notification email');
    return false;
  }

  const isRequest = data.newTripKind === 'request';
  const subject = isRequest
    ? `A family on your flight needs help (${data.routeLabel})`
    : `A companion is available on your flight (${data.routeLabel})`;

  const flightLine =
    data.flightNumbers.length > 0 ? `Flight: ${data.flightNumbers.join(', ')}\n` : '';

  const body = [
    `Hi,`,
    ``,
    isRequest
      ? `${data.posterName} is looking for a companion for a family member travelling on your route.`
      : `${data.posterName} is offering to help on your route.`,
    ``,
    `Route: ${data.routeLabel}`,
    `Date: ${data.travelDate}`,
    flightLine ? flightLine.trim() : null,
    ``,
    `View the trip and send a match request:`,
    data.tripUrl,
    ``,
    `— Saathi`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    const { error } = await client.emails.send({
      from: FROM,
      to,
      subject,
      text: body,
    });

    if (error) {
      console.error('[email] Resend error:', error);
      return false;
    }

    console.log(`[email] match notification sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[email] failed to send:', err);
    return false;
  }
}
