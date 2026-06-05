'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import { matchRequests } from '@/lib/db/schema';
import { moderateText } from '@/lib/moderation';

const Input = z.object({
  trip_id: z.string().uuid(),
  intro_message: z.string().trim().min(30).max(1000),
});

export async function sendMatchRequestAction(input: z.infer<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Please write at least a couple of sentences.' } as const;
  }
  const userId = await getUserId();
  if (!userId) return { ok: false, error: 'Please sign in.' } as const;

  // The 2-of-N verification gate was removed alongside the verifications
  // table (see migration 0009). Sending a match request is now open to any
  // signed-in user who's completed onboarding. Moderation on the intro
  // message is still enforced below — that's the load-bearing check now.

  const mod = await moderateText(parsed.data.intro_message);
  if (mod.flagged) {
    return { ok: false, error: 'Please revise your message — it was flagged.' } as const;
  }

  try {
    await withUser(userId, (tx) =>
      tx.insert(matchRequests).values({
        tripId: parsed.data.trip_id,
        requesterId: userId,
        introMessage: parsed.data.intro_message,
      }),
    );
  } catch (err) {
    // Postgres unique-violation = 23505. postgres.js attaches `code` onto
    // the error; matchRequests has a UNIQUE (trip_id, requester_id), so a
    // duplicate is the typical "already sent" case.
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return { ok: false, error: "You've already sent a request for this trip." } as const;
    }
    return { ok: false, error: (err as Error).message } as const;
  }
  revalidatePath('/dashboard');
  return { ok: true } as const;
}
