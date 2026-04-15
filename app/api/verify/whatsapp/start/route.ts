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
