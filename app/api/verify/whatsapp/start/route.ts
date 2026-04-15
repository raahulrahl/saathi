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
 *   - Dual rate limit (per-user + per-IP) via Upstash; see lib/rate-limit
 *   - E.164 format check before hitting Twilio (saves a round trip)
 *
 * Responses:
 *   200 { ok: true }               — OTP sent successfully
 *   400 { ok: false, error: string} — malformed phone or body
 *   401 { ok: false, error: string} — not signed in
 *   429 { ok: false, error: string} — rate limited (headers: Retry-After, X-RateLimit-*)
 *   502 { ok: false, error: string} — Twilio refused the send (rare: bad cred, number blocked)
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { isPlausibleE164, startWhatsAppVerification } from '@/lib/verify';

const Body = z.object({ phone: z.string().trim() });

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Rate-limit by user AND by IP. A malicious user could iterate accounts to
  // spam Twilio; an IP limit catches that. Conversely, a shared-IP office
  // shouldn't lock each other out, so the user limit is the primary one and
  // the IP limit is the belt-and-braces second check. Both must pass.
  const ip = clientIp(request.headers);
  const [userCheck, ipCheck] = await Promise.all([
    checkRateLimit(`verify-start:user:${userId}`),
    checkRateLimit(`verify-start:ip:${ip}`),
  ]);
  if (!userCheck.success || !ipCheck.success) {
    const failing = !userCheck.success ? userCheck : ipCheck;
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Try again in a minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((failing.reset - Date.now()) / 1000))),
          'X-RateLimit-Limit': String(failing.limit),
          'X-RateLimit-Remaining': String(failing.remaining),
          'X-RateLimit-Reset': String(Math.ceil(failing.reset / 1000)),
        },
      },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success || !isPlausibleE164(parsed.data.phone)) {
    return NextResponse.json(
      { ok: false, error: 'Enter a WhatsApp number in international format, e.g. +91…' },
      { status: 400 },
    );
  }

  try {
    await startWhatsAppVerification(parsed.data.phone);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to start verification';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
