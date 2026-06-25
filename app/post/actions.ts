'use server';

/**
 * Server action for creating a new trip — used by both
 * /dashboard/new/request and /dashboard/new/offer via the shared
 * PostWizard. Runs as the authenticated user so RLS enforces owner-only
 * inserts.
 *
 * Data model (post-migrations 0013 + 0014):
 *   - trips table: route, date, airline, languages, etc.
 *   - trip_travellers table: one row per person being helped on a request trip.
 *
 * Insertion goes through the create_trip_with_travellers Postgres
 * function (0022), which wraps both table writes in a single
 * transaction inside the function body — either both land or neither
 * does. Replaces the previous two-step insert + naive DELETE rollback
 * (bug M08).
 */

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withUser } from '@/lib/db';
import { isValidIata } from '@/lib/iata';
import { LANGUAGES } from '@/lib/languages';
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
    languages: z
      .array(
        z.string().refine((v) => LANGUAGES.includes(v), {
          message: 'Unknown language.',
        }),
      )
      .min(1),
    gender_preference: z.enum(['any', 'male', 'female']).default('any'),
    help_categories: z.array(z.string().min(1)).default([]),
    thank_you_eur: z.number().int().min(0).max(500).optional().nullable(),
    notes: z
      .string()
      .max(2000)
      .refine((v) => !/\+?\d[\d\s\-().]{7,}/.test(v), {
        message: 'Notes can’t include phone numbers — contact details unlock after a match.',
      })
      .refine((v) => !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(v), {
        message: 'Notes can’t include email addresses — contact details unlock after a match.',
      })
      .optional()
      .default(''),
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

export async function createTripAction(input: TripInput) {
  const parsed = TripSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid trip.' } as const;
  }
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: 'Please sign in.' } as const;
  }

  const p = parsed.data;
  if (p.notes) {
    const mod = await moderateText(p.notes);
    if (mod.flagged) return { ok: false, error: 'Please revise your notes.' } as const;
  }

  // Cast arrays to ::text[] in the SQL so postgres.js binds them as
  // text[] rather than as a json-shaped value. travellers is a jsonb.
  const travellersForRpc =
    p.kind === 'request'
      ? p.travellers.map((t) => ({
          first_name: t.first_name ?? '',
          age_band: t.age_band ?? '',
          medical_notes: t.medical_notes ?? '',
        }))
      : [];

  const flightNumbersFiltered = p.flight_numbers.filter(Boolean);
  const thankYou = p.kind === 'request' ? (p.thank_you_eur ?? null) : null;
  const notes = p.notes || null;
  const airline = p.airline || null;

  let newTripId: string;
  try {
    newTripId = await withUser(userId, async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`select public.create_trip_with_travellers(
          ${p.kind}::text,
          ${p.route}::text[],
          ${p.travel_date}::date,
          ${airline}::text,
          ${flightNumbersFiltered}::text[],
          ${p.languages}::text[],
          ${p.gender_preference}::text,
          ${p.help_categories}::text[],
          ${thankYou}::integer,
          ${notes}::text,
          ${JSON.stringify(travellersForRpc)}::jsonb
        ) as id`,
      );
      const arr = rows as unknown as Array<{ id: string }>;
      const id = arr[0]?.id;
      if (!id) throw new Error('create_trip_with_travellers returned no id');
      return id;
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message } as const;
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
      flight_numbers: flightNumbersFiltered,
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
