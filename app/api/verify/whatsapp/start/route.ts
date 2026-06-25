/**
 * POST /api/verify/whatsapp/start
 *
 * Kicks off Twilio Verify for a WhatsApp number — Twilio sends a 6-digit
 * OTP to the phone on WhatsApp. Called from the inline
 * <WhatsAppOtpVerify> widget on the onboarding form. The companion
 * endpoint /api/verify/whatsapp/check validates the code the user types
 * back and stamps whatsapp_validated_at on their profile.
 *
 * Protection:
 *   - Clerk auth required (middleware enforces this for /api/verify/**)
 *   - Rate limiting not yet wired — will add when Upstash is configured
 *   - E.164 format check before hitting Twilio (saves a round trip)
 *
 * Responses:
 *   200 { ok: true }               — OTP sent successfully
 *   400 { ok: false, error: string} — malformed phone or body
 *   401 { ok: false, error: string} — not signed in
 *   429 { ok: false, error: string} — rate limited (headers: Retry-After, X-RateLimit-*)
 *   502 { ok: false, error: string} — Twilio refused the send (rare: bad cred, number blocked)
 */

import { getUserId } from '@/lib/auth-guard';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlausibleE164 } from '@/lib/verify';
import { startWhatsAppVerification } from '@/lib/whatsapp-auth';

const Body = z.object({ phone: z.string().trim() });

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Rate limiting removed — will be re-added when Upstash is configured
  // with a read-write token. Until then, requests are unthrottled.

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success || !isPlausibleE164(parsed.data.phone)) {
    return NextResponse.json(
      { ok: false, error: 'Enter a WhatsApp number in international format, e.g. +91…' },
      { status: 400 },
    );
  }

  try {
    await startWhatsAppVerification(userId, parsed.data.phone);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to start verification';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
