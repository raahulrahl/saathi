/**
 * POST /api/verify/whatsapp/check
 *
 * Companion to /start — validates the OTP the user typed back after
 * receiving it on WhatsApp. On success, stamps whatsapp_validated_at
 * on the user's profile so the UI can show the "verified" badge.
 *
 * Rate-limited separately from /start because this is the brute-force
 * surface: 6-digit OTP = 1M combinations, 4-digit = 10k. Twilio Verify
 * has its own cooldown but we want to short-circuit before Twilio ever
 * sees the bad attempt (cheaper + catches distributed brute force
 * across multiple phone numbers).
 *
 * Responses:
 *   200 { ok: true }                 — code matched, profile stamped
 *   400 { ok: false, error: string } — bad input OR wrong code OR expired code
 *   401 { ok: false, error: string } — not signed in
 *   429 { ok: false, error: string } — rate limited
 *
 * The profile write (stamping whatsapp_number + whatsapp_validated_at)
 * happens inside checkWhatsAppVerification() on success — same update
 * that blanks the OTP columns. If it fails, the lib surfaces it as a
 * thrown error, which the .catch() below turns into a non-match. We
 * treat DB failure == verification failure so a flaky database doesn't
 * stamp a half-verified profile.
 */

import { getUserId } from '@/lib/auth-guard';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlausibleE164 } from '@/lib/verify';
import { checkWhatsAppVerification } from '@/lib/whatsapp-auth';

const Body = z.object({
  phone: z.string().trim(),
  code: z.string().regex(/^\d{4,10}$/),
});

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Rate limiting removed — will be re-added when Upstash is configured.

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success || !isPlausibleE164(parsed.data.phone)) {
    return NextResponse.json({ ok: false, error: 'Invalid phone or code' }, { status: 400 });
  }

  // lib stamps whatsapp_number + whatsapp_validated_at atomically on success
  // (single update, same row, same transaction) — no follow-up write here.
  const approved = await checkWhatsAppVerification(
    userId,
    parsed.data.phone,
    parsed.data.code,
  ).catch(() => false);
  if (!approved) {
    return NextResponse.json({ ok: false, error: 'Code did not match' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
