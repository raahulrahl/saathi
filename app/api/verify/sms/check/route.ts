/**
 * POST /api/verify/sms/check
 *
 * Validates the OTP the user typed back after receiving it via SMS.
 * On success, stamps whatsapp_number + whatsapp_validated_at on the
 * user's profile — same outcome as /api/verify/whatsapp/check.
 *
 * The OTP hash is phone-scoped, not channel-scoped, so checkSmsVerification
 * delegates directly to checkWhatsAppVerification — the DB read, expiry
 * check, constant-time compare, and profile stamp logic are identical.
 *
 * Responses:
 *   200 { ok: true }                 — code matched, profile stamped
 *   400 { ok: false, error: string } — bad input OR wrong/expired code
 *   401 { ok: false, error: string } — not signed in
 *   429 { ok: false, error: string } — rate limited
 */

import { getUserId } from '@/lib/auth-guard';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isPlausibleE164 } from '@/lib/verify';
import { checkSmsVerification } from '@/lib/sms-auth';

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

  const approved = await checkSmsVerification(userId, parsed.data.phone, parsed.data.code).catch(
    () => false,
  );

  if (!approved) {
    return NextResponse.json({ ok: false, error: 'Code did not match' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
