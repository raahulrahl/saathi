import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkWhatsAppVerification, isPlausibleE164 } from '@/lib/verify';

const Body = z.object({
  phone: z.string().trim(),
  code: z.string().regex(/^\d{4,10}$/),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  // Rate-limit check requests too — without this a leaked OTP (or a tighter
  // numeric brute force: 4-digit codes = 10k combinations) is trivially
  // automated. Twilio Verify has its own cooldown, but we want to stop the
  // attempt before it gets there.
  const ip = clientIp(request.headers);
  const [userCheck, ipCheck] = await Promise.all([
    checkRateLimit(`verify-check:user:${userId}`),
    checkRateLimit(`verify-check:ip:${ip}`),
  ]);
  if (!userCheck.success || !ipCheck.success) {
    const failing = !userCheck.success ? userCheck : ipCheck;
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Try again in a minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((failing.reset - Date.now()) / 1000))),
        },
      },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success || !isPlausibleE164(parsed.data.phone)) {
    return NextResponse.json({ ok: false, error: 'Invalid phone or code' }, { status: 400 });
  }

  const approved = await checkWhatsAppVerification(parsed.data.phone, parsed.data.code).catch(
    () => false,
  );
  if (!approved) {
    return NextResponse.json({ ok: false, error: 'Code did not match' }, { status: 400 });
  }

  // Mirror the verification into the DB — matches the trigger behavior for
  // OAuth identities, but for WhatsApp we do it from the API route.
  const { error } = await supabase.from('verifications').upsert(
    {
      user_id: userId,
      channel: 'whatsapp',
      handle: parsed.data.phone,
      verified_at: new Date().toISOString(),
      proof: { channel: 'whatsapp', via: 'twilio_verify' },
    },
    { onConflict: 'user_id,channel' },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
