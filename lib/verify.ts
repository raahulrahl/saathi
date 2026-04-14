/**
 * Twilio Verify wrapper for WhatsApp OTP. See Product Spec §8.
 *
 * We use Verify directly (not Supabase phone auth) so the OTP lands in
 * WhatsApp, not SMS — Indian parents overwhelmingly expect WhatsApp.
 *
 * Runtime dependency: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_VERIFY_SERVICE_SID. In dev without creds, both functions no-op with a
 * clear error so the UI can show a stub banner.
 */

const TWILIO_BASE = 'https://verify.twilio.com/v2';

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !serviceSid) {
    throw new Error('Twilio Verify is not configured. Set TWILIO_* env vars.');
  }
  return { sid, token, serviceSid };
}

function auth(sid: string, token: string) {
  // Web-standard btoa works in Edge + Node 20.
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

/** Kick off a verification — Twilio sends an OTP to the WhatsApp number. */
export async function startWhatsAppVerification(toE164: string) {
  const { sid, token, serviceSid } = creds();
  const res = await fetch(`${TWILIO_BASE}/Services/${serviceSid}/Verifications`, {
    method: 'POST',
    headers: {
      Authorization: auth(sid, token),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164, Channel: 'whatsapp' }),
  });
  if (!res.ok) {
    throw new Error(`Twilio Verify start failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { sid: string; status: string };
}

/** Check a code submitted by the user. Returns true iff Twilio says "approved". */
export async function checkWhatsAppVerification(toE164: string, code: string): Promise<boolean> {
  const { sid, token, serviceSid } = creds();
  const res = await fetch(`${TWILIO_BASE}/Services/${serviceSid}/VerificationCheck`, {
    method: 'POST',
    headers: {
      Authorization: auth(sid, token),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164, Code: code }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { status?: string };
  return body.status === 'approved';
}

/** Very simple E.164 check. Good enough for the form; Twilio rejects the rest. */
export function isPlausibleE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
