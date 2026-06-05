'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { withUser } from '@/lib/db';
import { profileLanguages, profiles } from '@/lib/db/schema';
import { lookupPhoneNumber } from '@/lib/verify';
import { LANGUAGES } from '@/lib/languages';

/**
 * Simplified onboarding write. Single form — role, name, languages,
 * WhatsApp number, social URLs, optional bio. Runs as the authenticated
 * user so RLS enforces owner-writes-only.
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
    primaryLanguage: z.string().refine((v) => LANGUAGES.includes(v), {
      message: 'Pick a primary language from the list.',
    }),
    languages: z
      .array(
        z.string().refine((v) => LANGUAGES.includes(v), {
          message: 'Unknown language.',
        }),
      )
      .min(1, 'Pick at least one language.'),
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

  // Prefer Twilio's canonical E.164 when Lookup verified the number
  // (handles e.g. stripped leading zeros in national format), otherwise
  // use libphonenumber-js's normalisation.
  const finalPhone = lookup.valid === true ? lookup.e164 : normalisedPhone;

  // Whole save runs in one user-scoped transaction. Profile update +
  // language wipe-and-insert are atomic — if the language insert fails,
  // the profile change rolls back too.
  try {
    await withUser(userId, async (tx) => {
      // Preserve whatsapp_validated_at ONLY if the user hasn't changed
      // their phone since it was last validated.
      const existingRows = await tx
        .select({
          whatsapp_number: profiles.whatsappNumber,
          whatsapp_validated_at: profiles.whatsappValidatedAt,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      const existing = existingRows[0] ?? null;
      const phoneUnchanged = existing?.whatsapp_number === finalPhone;
      const preservedValidatedAt = phoneUnchanged ? existing?.whatsapp_validated_at : null;

      await tx
        .update(profiles)
        .set({
          displayName: parsed.data.displayName,
          role: parsed.data.role,
          whatsappNumber: finalPhone,
          whatsappValidatedAt: preservedValidatedAt ?? null,
          bio: parsed.data.bio,
          linkedinUrl: parsed.data.linkedinUrl,
          facebookUrl: parsed.data.facebookUrl,
          twitterUrl: parsed.data.twitterUrl,
          instagramUrl: parsed.data.instagramUrl,
          onboardingComplete: true,
        })
        .where(eq(profiles.id, userId));

      // profile_languages is now the sole source of truth for who speaks
      // what. Wipe + reinsert is simple and correct at our per-user volume
      // (<10 rows). Inside the same tx, the wipe is rolled back if the
      // insert fails.
      await tx.delete(profileLanguages).where(eq(profileLanguages.profileId, userId));

      if (parsed.data.languages.length > 0) {
        const langRows = parsed.data.languages.map((language) => ({
          profileId: userId,
          language,
          isPrimary: language === parsed.data.primaryLanguage,
        }));
        await tx.insert(profileLanguages).values(langRows);
      }
    });
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message}` };
  }

  revalidatePath('/dashboard');
  revalidatePath('/onboarding');
  revalidatePath(`/profile/${userId}`);
  redirect('/dashboard?welcome=1');
}
