'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Simplified onboarding write. Just the fields the new single-form flow
 * captures — role, name, primary + other languages, WhatsApp number,
 * optional bio. Uses the Clerk-aware Supabase client so RLS enforces
 * owner-writes-only.
 */
const OnboardingSchema = z.object({
  displayName: z.string().trim().min(1, 'Tell us what to call you.').max(60),
  role: z.enum(['family', 'companion']),
  primaryLanguage: z.string().min(1),
  languages: z.array(z.string().min(1)).min(1),
  whatsappNumber: z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, like +91…'),
  bio: z.string().max(280).nullable(),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export async function saveOnboardingProfile(
  input: OnboardingInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      primary_language: parsed.data.primaryLanguage,
      languages: parsed.data.languages,
      whatsapp_number: parsed.data.whatsappNumber,
      bio: parsed.data.bio,
    })
    .eq('id', userId);

  if (error) {
    return { ok: false, error: `Save failed: ${error.message}` };
  }

  revalidatePath('/dashboard');
  revalidatePath('/onboarding');
  revalidatePath(`/profile/${userId}`);
  return { ok: true };
}
