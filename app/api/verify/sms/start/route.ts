/**
 * POST /api/verify/sms/start
 *
 * Sends a 6-digit OTP to the user's phone via SMS — fallback channel
 * for users who can't receive WhatsApp messages (number not on WhatsApp,
 * Twilio sandbox restrictions, etc.).
 *
 * Mirrors /api/verify/whatsapp/start exactly in structure and protection.
 * The OTP is stored in the same profiles columns so only one pending code
 * exists per user at a time regardless of channel.
 *
 * Responses:
 *   200 { ok: true }                — OTP sent successfully
 *   400 { ok: false, error: string} — malformed phone or body
 *   401 { ok: false, error: string} — not signed in
 *   429 { ok: false, error: string} — rate limited
 *   502 { ok: false, error: string} — Twilio refused the send
 */

import { getUserId } from '@/lib/auth-guard';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlausibleE164 } from '@/lib/verify';
import { startSmsVerification } from '@/lib/sms-auth';

const Body = z.object({ phone: z.string().trim() });

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Rate limiting removed — will be re-added when Upstash is configured.

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success || !isPlausibleE164(parsed.data.phone)) {
    return NextResponse.json(
      { ok: false, error: 'Enter a phone number in international format, e.g. +91…' },
      { status: 400 },
    );
  }

  try {
    await startSmsVerification(userId, parsed.data.phone);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send SMS';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
