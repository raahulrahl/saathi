'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) return { ok: false, error: 'Please sign in.' } as const;

  const { data: verifs } = await supabase
    .from('verifications')
    .select('channel, verified_at')
    .eq('user_id', userResp.user.id);
  if ((verifs ?? []).filter((v) => v.verified_at).length < 2) {
    return { ok: false, error: 'Please verify at least two channels first.' } as const;
  }

  const mod = await moderateText(parsed.data.intro_message);
  if (mod.flagged) {
    return { ok: false, error: 'Please revise your message — it was flagged.' } as const;
  }

  const { error } = await supabase.from('match_requests').insert({
    trip_id: parsed.data.trip_id,
    requester_id: userResp.user.id,
    intro_message: parsed.data.intro_message,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: "You've already sent a request for this trip." } as const;
    }
    return { ok: false, error: error.message } as const;
  }
  revalidatePath('/dashboard');
  return { ok: true } as const;
}
