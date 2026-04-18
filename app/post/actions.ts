'use server';

/**
 * Server action for creating a new trip — used by both
 * /dashboard/new/request and /dashboard/new/offer via the shared
 * PostWizard. Writes through the Clerk-aware Supabase client so RLS
 * enforces owner-only inserts.
 *
 * Data model (post-migrations 0013 + 0014):
 *   - trips table: route, date, airline, languages, etc. — no per-traveller fields.
 *   - trip_travellers table: one row per person being helped on a request trip
 *     (elder, pregnant traveller, first-time flyer with a language barrier, etc.).
 *
 * For a request, this action inserts the trip row and then inserts
 * the traveller rows (if any) in a separate INSERT. Both live in the same
 * implicit PostgREST request so they either both land or both fail —
 * but if the second call errors we explicitly delete the trip to
 * avoid a half-written request being visible in /search.
 */

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidIata } from '@/lib/iata';
import { moderateText } from '@/lib/moderation';
import { findAndNotifyMatches } from '@/lib/notify';

/**
 * A single elderly traveller on a request trip. Each has their own
 * first name, age band, and medical notes — sort order preserves the
 * user's entry sequence on the form.
 */
const ElderSchema = z.object({
  first_name: z.string().max(60).optional().default(''),
  age_band: z.enum(['60-70', '70-80', '80+']).optional().nullable(),
  medical_notes: z.string().max(1000).optional().default(''),
});

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
    /**
     * Array of elderly travellers. Only applies to kind='request'; the
     * server strips this for offers. Minimum zero, maximum four (we
     * don't expect a family group of five+ on one flight in practice —
     * raise the cap when a real user hits it).
     */
    elders: z.array(ElderSchema).max(4).optional().default([]),
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
export type ElderInput = z.infer<typeof ElderSchema>;

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
  } satisfies Record<string, unknown>;

  const { data: created, error } = await supabase
    .from('trips')
    .insert(insertRow)
    .select('id')
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Could not create trip.' } as const;
  }

  // Insert any elder rows for a request trip. Offers always skip this —
  // the schema strips the array client-side for offer flows, but we
  // double-check here so a tampered payload can't attach elders to an
  // offer.
  if (p.kind === 'request' && p.elders.length > 0) {
    const elderRows = p.elders.map((e, i) => ({
      trip_id: created.id,
      first_name: e.first_name || null,
      age_band: e.age_band ?? null,
      medical_notes: e.medical_notes || null,
      sort_order: i,
    }));

    const { error: elderError } = await supabase.from('trip_elders').insert(elderRows);

    if (elderError) {
      // Roll back the trip insert so we don't leave a half-written
      // request visible on /search without any parent info.
      await supabase.from('trips').delete().eq('id', created.id);
      return {
        ok: false,
        error: elderError.message ?? 'Could not save parent details.',
      } as const;
    }
  }

  // Fire-and-forget: find existing trips that match this one and notify
  // their owners. Don't await — trip creation shouldn't block on
  // notification delivery.
  findAndNotifyMatches({
    id: created.id,
    user_id: userId,
    kind: p.kind,
    route: p.route,
    travel_date: p.travel_date,
    flight_numbers: p.flight_numbers.filter(Boolean),
    languages: p.languages,
  }).catch((err) => console.error('[auto-match] notification failed:', err));

  revalidatePath('/dashboard');
  revalidatePath('/search');
  redirect(`/trip/${created.id}?new=true`);
}
