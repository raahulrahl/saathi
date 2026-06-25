import 'server-only';

import { generateOtp, hashOtp } from '@/lib/otp';
import { eq } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { profiles } from '@/lib/db/schema';

/**
 * SMS OTP verification via Twilio Messages API.
 *
 * Fallback channel for users whose numbers aren't on WhatsApp, or when
 * WhatsApp delivery fails (e.g. Twilio sandbox restrictions). Uses the same
 * OTP hash/expiry columns on the profiles table as the WhatsApp flow —
 * only one pending code exists per user at a time, regardless of channel.
 *
 * On success, stamps whatsapp_number + whatsapp_validated_at identically
 * to the WhatsApp flow. A verified phone is a verified phone.
 *
 * The check half (checkSmsVerification) is re-exported from whatsapp-auth
 * because the hash is phone-scoped, not channel-scoped — verification logic
 * is identical whether the code arrived via WhatsApp or SMS.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_SMS_FROM          — E.164 Twilio number, e.g. +15551234567
 */

async function sendSmsOtp(phone: string, code: string): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;

  if (!sid || !token || !from) {
    return {
      ok: false,
      detail: 'SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM.',
    };
  }

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Your Saathi verification code is: ${code}. Valid for 10 minutes. Do not share this code.`,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
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
    return { ok: false, detail: `Twilio SMS ${res.status}: ${text.replace(code, '***')}` };
  }

  const json = (await res.json().catch(() => ({}))) as {
    sid?: string;
    error_code?: number | null;
    error_message?: string | null;
  };
  if (json.error_code) {
    return {
      ok: false,
      detail: `Twilio error ${json.error_code}: ${json.error_message ?? 'unknown'}`,
    };
  }
  return { ok: true, detail: json.sid ?? 'sent' };
}

const OTP_TTL_SECONDS = 10 * 60;

/**
 * Start an SMS OTP verification for `userId` + `toE164`. Generates a code,
 * writes its hash + 10-min expiry to the user's profile row, and sends the
 * code via Twilio SMS. Returns the Twilio message SID.
 */
export async function startSmsVerification(userId: string, toE164: string): Promise<string> {
  const code = generateOtp();
  const hashed = hashOtp(toE164, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  try {
    await withService((tx) =>
      tx
        .update(profiles)
        .set({ whatsappOtpHash: hashed, whatsappOtpExpiresAt: expiresAt })
        .where(eq(profiles.id, userId)),
    );
  } catch (err) {
    throw new Error(`Could not stage OTP: ${(err as Error).message}`);
  }

  const sent = await sendSmsOtp(toE164, code);
  if (!sent.ok) {
    // Clean up so a retry isn't blocked by the stale hash
    try {
      await withService((tx) =>
        tx
          .update(profiles)
          .set({ whatsappOtpHash: null, whatsappOtpExpiresAt: null })
          .where(eq(profiles.id, userId)),
      );
    } catch {
      // best-effort
    }
    throw new Error(sent.detail);
  }

  return sent.detail;
}

/**
 * Check a submitted `code` against the hash stored for `userId`.
 *
 * The OTP hash is phone-scoped, not channel-scoped — a code generated for
 * WhatsApp delivery and one for SMS delivery are verified identically.
 * Re-exported from whatsapp-auth to avoid duplicating the DB read, expiry
 * check, constant-time compare, and profile stamp logic.
 */
export { checkWhatsAppVerification as checkSmsVerification } from './whatsapp-auth';
