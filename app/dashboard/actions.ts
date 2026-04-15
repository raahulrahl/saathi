'use server';

/**
 * Dashboard server actions. Single responsibility for now — accepting or
 * declining incoming match_requests from the "Incoming" tab.
 */

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const Input = z.object({
  id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

/**
 * Flip match_requests.status for an incoming request. The heavy lifting
 * happens in a Postgres trigger (see 0005_clerk.sql — the
 * handle_match_request_accepted function):
 *
 *   - On 'accepted': inserts a row into matches, auto-declines every
 *     other pending request on the same trip, and flips the trip to
 *     status='matched'.
 *   - On 'declined': stamps responded_at only.
 *
 * RLS on match_requests enforces that only the TRIP OWNER (not the
 * requester) can run this update — see the "match_requests: trip owner
 * responds" policy.
 *
 * Returns a discriminated-union result for the client to render inline
 * feedback. Revalidates /dashboard so the card disappears from the
 * Incoming tab after the response.
 */
export async function respondToMatchRequestAction(input: z.infer<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad input' } as const;
  const supabase = await createSupabaseServerClient();
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Not signed in' } as const;

  const { error } = await supabase
    .from('match_requests')
    .update({ status: parsed.data.decision })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message } as const;

  revalidatePath('/dashboard');
  return { ok: true } as const;
}
