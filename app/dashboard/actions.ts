'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const Input = z.object({
  id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

/**
 * Flips match_requests.status. The trigger in 0003 handles the rest:
 * creates the match row, auto-declines sibling requests, and moves the trip
 * to 'matched'. RLS ensures only the trip owner can perform the update.
 */
export async function respondToMatchRequestAction(input: z.infer<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad input' } as const;
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) return { ok: false, error: 'Not signed in' } as const;

  const { error } = await supabase
    .from('match_requests')
    .update({ status: parsed.data.decision })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message } as const;

  revalidatePath('/dashboard');
  return { ok: true } as const;
}
