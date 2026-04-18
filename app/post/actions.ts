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
import { after } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidIata } from '@/lib/iata';
import { moderateText } from '@/lib/moderation';
import { enqueueMatchNotifications } from '@/lib/notifications/enqueue';
import { dispatchPendingNotifications } from '@/lib/notifications/dispatch';

/**
 * A single traveller on a request trip — the person being helped.
 * Could be elderly, pregnant, first-time flying, unfamiliar with the
 * language, or anyone else who wants a companion on the flight. Each
 * has their own first name, age band, and notes — sort order preserves
 * the user's entry sequence on the form.
 */
const TravellerSchema = z.object({
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
    /**
     * Flight numbers per leg. Canonicalised at write time: trimmed,
     * uppercased, interior whitespace + hyphens stripped. That way
     * "qr540", "QR 540", and "QR-540" all store as "QR540", and the
     * matcher doesn't need to guess the user's typing conventions at
     * read time. Empty slots stay in the array to preserve positional
     * alignment with `route` (leg i has flight_numbers[i]); they're
     * stripped in the action just before insert.
     *
     * The regex accepts 2-char alphanumeric IATA airline codes (so
     * "6E123", "9W456" are valid) plus 1-4 digit flight numbers.
     */
    flight_numbers: z
      .preprocess(
        (v) => {
          if (!Array.isArray(v)) return v;
          return v.map((s) =>
            typeof s === 'string' ? s.trim().toUpperCase().replace(/[\s-]/g, '') : s,
          );
        },
        z.array(
          z
            .string()
            .regex(/^$|^[A-Z0-9]{2}\d{1,4}$/, 'Flight number must look like "QR540" or "6E123".'),
        ),
      )
      .optional()
      .default([]),
    languages: z.array(z.string().min(1)).min(1),
    gender_preference: z.enum(['any', 'male', 'female']).default('any'),
    help_categories: z.array(z.string().min(1)).default([]),
    thank_you_eur: z.number().int().min(0).max(500).optional().nullable(),
    /**
     * Free-text notes. Reject obvious phone / email patterns so users
     * don't paste contact info to bypass the match gate — that
     * contact info would otherwise leak to authenticated viewers via
     * the base trips table (see bug M09). Catches honest mistakes;
     * determined evaders can still spell out numbers in words, but
     * the friction here plus 0021's anon column-level revoke raises
     * the cost enough that the match-request flow stays the easier
     * path.
     */
    notes: z
      .string()
      .max(2000)
      .refine((v) => !/\+?\d[\d\s\-().]{7,}/.test(v), {
        message:
          'Notes can\u2019t include phone numbers \u2014 contact details unlock after a match.',
      })
      .refine((v) => !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(v), {
        message:
          'Notes can\u2019t include email addresses \u2014 contact details unlock after a match.',
      })
      .optional()
      .default(''),
    /**
     * Array of travellers being helped. Only applies to kind='request';
     * the server strips this for offers. Minimum zero, maximum four (we
     * don't expect a family group of five+ on one flight in practice —
     * raise the cap when a real user hits it).
     */
    travellers: z.array(TravellerSchema).max(4).optional().default([]),
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
export type TravellerInput = z.infer<typeof TravellerSchema>;

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

  // Single-transaction insert: the rpc wraps the trips insert and the
  // trip_travellers inserts in one Postgres function, so either both
  // tables have their rows or neither does. Replaces the previous
  // two-step insert + naive DELETE rollback (bug M08), which could
  // leak ghost trip rows if the DELETE itself failed.
  const travellersForRpc =
    p.kind === 'request'
      ? p.travellers.map((t) => ({
          first_name: t.first_name ?? '',
          age_band: t.age_band ?? '',
          medical_notes: t.medical_notes ?? '',
        }))
      : [];

  const { data: newTripId, error } = await supabase.rpc('create_trip_with_travellers', {
    p_kind: p.kind,
    p_route: p.route,
    p_travel_date: p.travel_date,
    p_airline: p.airline || null,
    p_flight_numbers: p.flight_numbers.filter(Boolean),
    p_languages: p.languages,
    p_gender_preference: p.gender_preference,
    p_help_categories: p.help_categories,
    p_thank_you_eur: p.kind === 'request' ? (p.thank_you_eur ?? null) : null,
    p_notes: p.notes || null,
    p_travellers: travellersForRpc,
  });

  if (error || !newTripId) {
    return { ok: false, error: error?.message ?? 'Could not create trip.' } as const;
  }

  // Enqueue notifications synchronously — this just writes rows to the
  // pending_notifications table, so it's cheap (<200 ms typical). The
  // actual send happens asynchronously via the dispatch worker.
  //
  // Doing the enqueue inside the Server Action (rather than after the
  // redirect) guarantees the rows land — fire-and-forget promises on
  // Vercel can get killed when the container freezes. See bug M03.
  try {
    await enqueueMatchNotifications({
      id: newTripId,
      user_id: userId,
      kind: p.kind,
      route: p.route,
      travel_date: p.travel_date,
      flight_numbers: p.flight_numbers.filter(Boolean),
      languages: p.languages,
    });
  } catch (err) {
    // Enqueue shouldn't fail in normal operation, but if it does we
    // still want the trip to post successfully — the 1-minute cron
    // won't discover these matches, but nothing corrupted.
    console.error('[auto-match] enqueue failed:', err);
  }

  // Best-effort immediate dispatch. `after()` runs after the response is
  // sent but Vercel keeps the function alive for it, so we don't repeat
  // the fire-and-forget-gets-killed problem. If this drops (e.g. platform
  // without `after()` support), the 1-minute cron drains the backlog.
  after(async () => {
    try {
      await dispatchPendingNotifications(50);
    } catch (err) {
      console.error('[auto-match] immediate dispatch failed:', err);
    }
  });

  revalidatePath('/dashboard');
  revalidatePath('/search');
  redirect(`/trip/${newTripId}?new=true`);
}
