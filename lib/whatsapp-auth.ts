import 'server-only';

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { profiles } from '@/lib/db/schema';

/**
 * WhatsApp OTP verification via Twilio's Messages API direct, with OTP
 * state stored on the user's profiles row.
 *
 * Storage decision: migrated off Upstash Redis after repeated
 * NOPERM-on-SET / NOPERM-on-EVALSHA errors rooted in Upstash's
 * TOKEN vs READONLY TOKEN distinction. Postgres is already load-bearing
 * elsewhere, doesn't have the same opt-in-to-write-permissions gotcha,
 * and keeps the OTP lifecycle on the same row that tracks
 * whatsapp_number + whatsapp_validated_at. One write updates everything
 * we care about atomically.
 *
 * State columns (added in migration 0010_whatsapp_otp.sql):
 *
 *   profiles.whatsapp_otp_hash        SHA-256(phone + ':' + code),
 *                                     never plaintext
 *   profiles.whatsapp_otp_expires_at  timestamptz, 10 min after send
 *
 * Both are NULL when no OTP is pending. A check constraint ensures
 * they're either both null or both set.
 *
 * Lifecycle:
 *   start  → generate code → update profile with hash + expires_at
 *           → send via Twilio Messages → if send fails, blank the
 *             columns so a stale row can't block a retry
 *   check  → read hash + expires_at → if expired, blank and fail →
 *             constant-time compare → on match: blank + stamp
 *             whatsapp_number + whatsapp_validated_at, return true
 *           → on miss: blank (single-use) and return false
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM          — "whatsapp:+14155238886" (sandbox)
 *   TWILIO_WHATSAPP_OTP_CONTENT_SID — "HX229f5a..." for the OTP template
 */

// -----------------------------------------------------------------------------
// Internal helpers: OTP gen, hash, constant-time compare
// -----------------------------------------------------------------------------

/** Cryptographically random 6-digit code, zero-padded. */
function generateOtp(): string {
  return String(randomInt(1_000_000)).padStart(6, '0');
}

/** SHA-256(phone + ':' + code). Phone acts as salt so identical codes
 *  across users don't produce identical hashes. */
function hashOtp(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/** Constant-time compare to prevent response-timing bruteforce. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// -----------------------------------------------------------------------------
// Twilio Messages API (unchanged from the Redis-backed version)
// -----------------------------------------------------------------------------

interface TwilioSendResult {
  ok: boolean;
  /** Twilio message SID when ok; error string otherwise. */
  detail: string;
}

async function sendOtpMessage(phone: string, code: string): Promise<TwilioSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID;

  if (!sid || !token || !from || !contentSid) {
    return {
      ok: false,
      detail:
        'Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and TWILIO_WHATSAPP_OTP_CONTENT_SID.',
    };
  }

  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
  const body = new URLSearchParams({
    To: to,
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ '1': code }),
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
    return {
      ok: false,
      detail: `Twilio Messages ${res.status}: ${text.replace(code, '***')}`,
    };
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

// -----------------------------------------------------------------------------
// Public API — called from app/api/verify/whatsapp/*
// -----------------------------------------------------------------------------

const OTP_TTL_SECONDS = 10 * 60;

/**
 * Start a WhatsApp OTP verification for `userId` + `toE164`. Generates
 * a code, writes its hash + 10-min expiry to the user's profile row,
 * and sends the code via Twilio Messages.
 *
 * Uses withService — the profiles row is the user's own, but owner-write
 * RLS would still let them update it; we use service role for consistency
 * with the rest of the clerk-sync trust boundary.
 *
 * Throws on config errors, on DB write errors (rare — DB down), or on
 * Twilio send errors (e.g. 63016 = recipient outside sandbox window).
 * Returns the Twilio message SID for server-side logging.
 */
export async function startWhatsAppVerification(userId: string, toE164: string): Promise<string> {
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

  const sent = await sendOtpMessage(toE164, code);
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
      // swallow — original send error is the meaningful one
    }
    throw new Error(sent.detail);
  }

  return sent.detail;
}

/**
 * Check a submitted `code` against the hash stored for `userId`.
 * Returns true iff the code matches AND hasn't expired.
 *
 * On success: also stamps whatsapp_number and whatsapp_validated_at
 * on the profile in the same update — one round-trip. The caller
 * doesn't need to do a separate profile write.
 *
 * On any outcome (match, miss, expired): blanks the OTP columns.
 * Single-use prevents replay (after success) and brute force (after
 * miss — attacker has to request a fresh code, which re-triggers
 * rate limits).
 */
export async function checkWhatsAppVerification(
  userId: string,
  toE164: string,
  code: string,
): Promise<boolean> {
  const cleanCode = code.trim().replace(/\D/g, '');
  if (cleanCode.length < 4 || cleanCode.length > 10) return false;

  const data = await withService(async (tx) => {
    const rows = await tx
      .select({
        whatsappOtpHash: profiles.whatsappOtpHash,
        whatsappOtpExpiresAt: profiles.whatsappOtpExpiresAt,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!data?.whatsappOtpHash || !data?.whatsappOtpExpiresAt) {
    return false;
  }

  // Expired? Blank and fail.
  const expired = new Date(data.whatsappOtpExpiresAt).getTime() < Date.now();
  if (expired) {
    try {
      await withService((tx) =>
        tx
          .update(profiles)
          .set({ whatsappOtpHash: null, whatsappOtpExpiresAt: null })
          .where(eq(profiles.id, userId)),
      );
    } catch {
      // best-effort cleanup
    }
    return false;
  }

  const submittedHash = hashOtp(toE164, cleanCode);
  const ok = constantTimeEquals(submittedHash, data.whatsappOtpHash);

  // Single-use regardless of outcome. On success, also stamp the
  // validated-at timestamp + store the canonical number.
  const updatePayload: Partial<typeof profiles.$inferInsert> = {
    whatsappOtpHash: null,
    whatsappOtpExpiresAt: null,
  };
  if (ok) {
    updatePayload.whatsappNumber = toE164;
    updatePayload.whatsappValidatedAt = new Date().toISOString();
  }

  try {
    await withService((tx) =>
      tx.update(profiles).set(updatePayload).where(eq(profiles.id, userId)),
    );
  } catch (err) {
    // If the stamp write fails on a successful match, we MUST propagate:
    // reporting "verified" without actually stamping the profile means the
    // UI badge never lights up and the user thinks verification broke.
    // On a miss (ok === false), the blanking is cleanup — swallowing is
    // safe because the expires_at check will treat the stale row as absent
    // next time, or the expiry window will bound the damage.
    if (ok) {
      throw new Error(`Could not stamp verification: ${(err as Error).message}`);
    }
  }

  return ok;
}
