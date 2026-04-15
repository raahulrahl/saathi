'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Simplified onboarding write. Single form — role, name, languages,
 * WhatsApp number, social URLs, optional bio. Uses the Clerk-aware
 * Supabase client so RLS enforces owner-writes-only.
 *
 * Validation mirrors the client form in onboarding-form.tsx:
 *   * libphonenumber-js re-parses the phone server-side. Client already
 *     validated, but we re-check so a hand-crafted POST can't sneak in
 *     garbage.
 *   * At least two social URLs non-empty.
 */

const UrlOrNull = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https?:\/\//i.test(v), {
    message: 'Link must start with http:// or https://',
  })
  .transform((v) => (v.length ? v : null))
  .nullable();

const OnboardingSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Tell us what to call you.').max(60),
    role: z.enum(['family', 'companion']),
    primaryLanguage: z.string().min(1),
    languages: z.array(z.string().min(1)).min(1, 'Pick at least one language.'),
    whatsappNumber: z.string().min(1, 'WhatsApp number required.'),
    bio: z.string().max(280).nullable(),
    linkedinUrl: UrlOrNull,
    facebookUrl: UrlOrNull,
    twitterUrl: UrlOrNull,
    instagramUrl: UrlOrNull,
  })
  .superRefine((data, ctx) => {
    const parsed = parsePhoneNumberFromString(data.whatsappNumber);
    if (!parsed || !parsed.isValid()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['whatsappNumber'],
        message: "That WhatsApp number doesn't look valid — include the country code with a +.",
      });
    }
    const socialCount = [
      data.linkedinUrl,
      data.facebookUrl,
      data.twitterUrl,
      data.instagramUrl,
    ].filter((v) => v && v.length > 0).length;
    if (socialCount < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedinUrl'],
        message: 'Share links to at least two social profiles.',
      });
    }
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

  // Store the phone in a normalised international format (E.164 without
  // spaces) so downstream systems always see the same shape regardless
  // of how the user typed it.
  const phone = parsePhoneNumberFromString(parsed.data.whatsappNumber);
  const normalisedPhone = phone?.number ?? parsed.data.whatsappNumber;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      primary_language: parsed.data.primaryLanguage,
      languages: parsed.data.languages,
      whatsapp_number: normalisedPhone,
      bio: parsed.data.bio,
      linkedin_url: parsed.data.linkedinUrl,
      facebook_url: parsed.data.facebookUrl,
      twitter_url: parsed.data.twitterUrl,
      instagram_url: parsed.data.instagramUrl,
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
