'use server';

/**
 * Server action for creating a new trip row — used by both /post/request
 * (family-posting flow) and /post/offer (companion-posting flow) via the
 * shared PostWizard. Writes through the Clerk-aware Supabase client so
 * RLS enforces owner-only inserts.
 */

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidIata } from '@/lib/iata';
import { moderateText } from '@/lib/moderation';

/**
 * Wire-shape for createTripAction. Matches the form state from
 * PostWizard plus a few server-only fields (elderly_medical_notes) that
 * need to round-trip through the schema validator.
 *
 * superRefine adds two cross-field checks that can't be expressed with
 * a single zod rule:
 *   - every airport in `route` must be a plausible IATA code
 *   - no airport may appear twice (a layover that matches origin or
 *     destination is obviously wrong)
 */
const TripSchema = z
  .object({
    kind: z.enum(['request', 'offer']),
    route: z.array(z.string().regex(/^[A-Z]{3}$/)).min(2),
    travel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    airline: z.string().max(60).optional().default(''),
    flight_numbers: z.array(z.string().max(10)).optional().default([]),
    languages: z.array(z.string().min(1)).min(1),
    gender_preference: z.enum(['any', 'male', 'female']).default('any'),
    help_categories: z.array(z.string().min(1)).default([]),
    thank_you_eur: z.number().int().min(0).max(500).optional().nullable(),
    notes: z.string().max(2000).optional().default(''),
    elderly_first_name: z.string().max(60).optional().default(''),
    elderly_age_band: z.enum(['60-70', '70-80', '80+']).optional().nullable(),
    elderly_medical_notes: z.string().max(1000).optional().default(''),
  })
  .superRefine((v, ctx) => {
    if (!v.route.every(isValidIata)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['route'],
        message: 'Route contains an unknown IATA code.',
      });
    }
    if (new Set(v.route).size !== v.route.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['route'],
        message: 'Layover cannot repeat an airport on the route.',
      });
    }
  });

export type TripInput = z.infer<typeof TripSchema>;

/**
 * Validate the posted trip, run OpenAI moderation on the free-text
 * `notes` field, insert the row, and redirect the caller to the
 * public trip page.
 *
 * Returns a discriminated-union result when input is rejected — the
 * form surfaces the error string to the user. On success the function
 * doesn't return (the redirect() throws an error Next.js intercepts).
 *
 * Elderly fields (first_name, age_band, medical_notes) are stripped
 * server-side unless kind === 'request' — this prevents a malicious
 * companion from stuffing in fake elderly metadata. Thank-you amount
 * is likewise only stored on request trips.
 */
export async function createTripAction(input: TripInput) {
  const parsed = TripSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid trip.' } as const;
  }
  const supabase = await createSupabaseServerClient();
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: 'Please sign in.' } as const;
  }

  // The 2-of-N verification gate was dropped as part of the onboarding
  // simplification — any signed-in user who completed the onboarding form
  // can post. Trust badges still render on profile cards from whatever
  // verification rows the Clerk webhook populates behind the scenes.

  const p = parsed.data;
  if (p.notes) {
    const mod = await moderateText(p.notes);
    if (mod.flagged) return { ok: false, error: 'Please revise your notes.' } as const;
  }

  const insertRow = {
    user_id: userId,
    kind: p.kind,
    route: p.route,
    travel_date: p.travel_date,
    airline: p.airline || null,
    flight_numbers: p.flight_numbers.filter(Boolean),
    languages: p.languages,
    gender_preference: p.gender_preference,
    help_categories: p.help_categories,
    thank_you_eur: p.kind === 'request' ? (p.thank_you_eur ?? null) : null,
    notes: p.notes || null,
    elderly_first_name: p.kind === 'request' ? p.elderly_first_name || null : null,
    elderly_age_band: p.kind === 'request' ? (p.elderly_age_band ?? null) : null,
    elderly_photo_url: null,
    elderly_medical_notes: p.kind === 'request' ? p.elderly_medical_notes || null : null,
  } satisfies Record<string, unknown>;

  const { data: created, error } = await supabase
    .from('trips')
    .insert(insertRow)
    .select('id')
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Could not create trip.' } as const;
  }

  revalidatePath('/dashboard');
  revalidatePath('/search');
  redirect(`/trip/${created.id}?new=true`);
}
