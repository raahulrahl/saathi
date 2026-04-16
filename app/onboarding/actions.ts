'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { lookupPhoneNumber } from '@/lib/verify';

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

  // Start with a local libphonenumber-js normalise to E.164, then hand
  // off to Twilio Lookup for an actual assigned-carrier check. Lookup
  // fails open if Twilio isn't configured (local dev, preview without
  // secrets) — we don't block signups on a third-party we haven't wired.
  const phone = parsePhoneNumberFromString(parsed.data.whatsappNumber);
  const normalisedPhone = phone?.number ?? parsed.data.whatsappNumber;

  const lookup = await lookupPhoneNumber(normalisedPhone);
  if (lookup.valid === false) {
    return { ok: false, error: lookup.error };
  }
  // lookup.valid === null = Twilio not configured OR Twilio had an
  // operational error. In both cases we accept the number based on the
  // libphonenumber-js check we already ran. lookup.valid === true = good.

  const supabase = await createSupabaseServerClient();

  // Prefer Twilio's canonical E.164 when Lookup verified the number
  // (handles e.g. stripped leading zeros in national format), otherwise
  // use libphonenumber-js's normalisation.
  const finalPhone = lookup.valid === true ? lookup.e164 : normalisedPhone;

  // Preserve whatsapp_validated_at ONLY if the user hasn't changed their
  // phone number since it was last validated. If they've edited the
  // number, clear the validated timestamp so the UI prompts them to
  // re-run the OTP flow for the new one.
  const { data: existing } = await supabase
    .from('profiles')
    .select('whatsapp_number, whatsapp_validated_at')
    .eq('id', userId)
    .maybeSingle();

  const phoneUnchanged = existing?.whatsapp_number === finalPhone;
  const preservedValidatedAt = phoneUnchanged ? existing?.whatsapp_validated_at : null;

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      whatsapp_number: finalPhone,
      whatsapp_validated_at: preservedValidatedAt,
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

  // profile_languages is now the sole source of truth for who speaks
  // what. Wipe + reinsert is simple and correct at our per-user volume
  // (<10 rows). A failure here DOES fail the whole save — previously
  // we swallowed it because profiles.languages was the authoritative
  // cache, but that column is gone now, so a sync failure = no languages
  // saved at all.
  const { error: wipeError } = await supabase
    .from('profile_languages')
    .delete()
    .eq('profile_id', userId);
  if (wipeError) {
    return { ok: false, error: `Save failed (languages wipe): ${wipeError.message}` };
  }
  const langRows = parsed.data.languages.map((language) => ({
    profile_id: userId,
    language,
    is_primary: language === parsed.data.primaryLanguage,
  }));
  if (langRows.length > 0) {
    const { error: langError } = await supabase.from('profile_languages').insert(langRows);
    if (langError) {
      return { ok: false, error: `Save failed (languages insert): ${langError.message}` };
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/onboarding');
  revalidatePath(`/profile/${userId}`);
  redirect('/dashboard?welcome=1');
}
