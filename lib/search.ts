import 'server-only';

import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import type { DbTx } from '@/lib/db';
import { profileLanguages, profiles, publicProfiles, publicTrips, tripLegs } from '@/lib/db/schema';
import type { TripCardData } from '@/components/trip-card';
import { dateWindow } from '@/lib/dates';
import type { RankableTrip } from '@/lib/matching';

// Re-export so existing server callers can keep importing from `lib/search`.
// New callers (client components) should import from `lib/dates` directly.
export { dateWindow };

/**
 * Server-side search helpers. Each accepts a `DbTx` — callers wrap with
 * `withUser(userId | null, tx => …)` (role = anon | authenticated). The
 * RLS policies + `security_invoker=true` on the views do the rest.
 *
 * History: the parallel `Promise.all` in fetchViewerProfile
 * has been sequentialized. postgres.js serializes statements within a
 * transaction, so issuing two queries via Promise.all on the same tx
 * doesn't actually parallelize — and protocol-level interleaving on a
 * single connection is unsafe. Sub-millisecond impact at our scale on
 * two indexed lookups.
 */

// A ±1 day window around the user's chosen date. The previous ±3 days
// was too wide: same-route-different-day isn't "same plane" — it's a
// different flight. Keeping this tight reduces false positives.
export const DEFAULT_DATE_WINDOW_DAYS = 1;

/** User-identifying + language info, used for role-aware CTAs and
 * in-card bolding of shared languages. */
export interface ViewerProfile {
  role: 'family' | 'companion' | null;
  languages: string[];
  primaryLanguage: string | null;
}

/**
 * Fetch the three bits of viewer context we need for search: their role
 * (drives the FlightComposer's offer-mode submit target), their languages
 * (used to bold shared tokens on result cards), and their primary
 * language (ranking input).
 *
 * Returns defaults when `userId` is null or the profile row isn't
 * hydrated yet — both are legitimate states during a first anonymous
 * visit or right after sign-up before the self-heal fires.
 */
export async function fetchViewerProfile(tx: DbTx, userId: string | null): Promise<ViewerProfile> {
  if (!userId) return { role: null, languages: [], primaryLanguage: null };
  const profileRows = await tx
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = profileRows[0] ?? null;
  if (!profile) return { role: null, languages: [], primaryLanguage: null };

  const langRows = await tx
    .select({ language: profileLanguages.language, isPrimary: profileLanguages.isPrimary })
    .from(profileLanguages)
    .where(eq(profileLanguages.profileId, userId));

  const role =
    profile.role === 'family' || profile.role === 'companion'
      ? (profile.role as 'family' | 'companion')
      : null;
  return {
    role,
    languages: langRows.map((r) => r.language),
    primaryLanguage: langRows.find((r) => r.isPrimary)?.language ?? null,
  };
}

export interface TripQueryParams {
  from: string;
  to: string;
  /** ISO YYYY-MM-DD. Always applied — a ±dateWindowDays window. */
  date: string;
  flightNumbers: string[];
  dateWindowDays?: number;
}

/**
 * Find trips worth showing to a searcher looking for help on a leg
 * from `from` to `to` around `date`.
 *
 * Matching runs on `trip_legs` (added in migration 0016) in two steps:
 *
 *   1. SQL narrows the candidate set to trips whose legs overlap the
 *      searcher's implied leg — same (flight_number, date) where
 *      provided, else any leg with origin=from OR destination=to within
 *      ±dateWindowDays. This surfaces partial-leg helpers that the
 *      previous `contains(route, [from]) AND contains(route, [to])`
 *      filter silently dropped (bug 02).
 *   2. `lib/matching.ts::scoreTrip` does the final ranking in-memory
 *      using route / language / review signals.
 *
 * Always filters to status='open'. The date window applies to both
 * modes — flight numbers alone don't disambiguate, since QR540 is a
 * daily flight with a different airframe each day (bug 04).
 */
export async function fetchTripsForSearch(
  tx: DbTx,
  params: TripQueryParams,
): Promise<PublicTripRow[]> {
  const windowDays = params.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS;
  const { start, end } = dateWindow(params.date, windowDays);

  // ── Step 1. Gather candidate trip_ids from trip_legs. ──────────────
  const candidateIds = new Set<string>();

  if (params.flightNumbers.length > 0) {
    const flightHits = await tx
      .select({ tripId: tripLegs.tripId })
      .from(tripLegs)
      .where(
        and(
          inArray(tripLegs.flightNumber, params.flightNumbers),
          gte(tripLegs.travelDate, start),
          lte(tripLegs.travelDate, end),
        ),
      );
    for (const row of flightHits) candidateIds.add(row.tripId);
  }

  // origin=from OR destination=to — covers end-to-end matches AND
  // partial-leg helpers (a companion on just the DOH→AMS leg of a
  // CCU→DOH→AMS request shows up via destination=AMS).
  const odHits = await tx
    .select({ tripId: tripLegs.tripId })
    .from(tripLegs)
    .where(
      and(
        or(eq(tripLegs.origin, params.from), eq(tripLegs.destination, params.to)),
        gte(tripLegs.travelDate, start),
        lte(tripLegs.travelDate, end),
      ),
    );
  for (const row of odHits) candidateIds.add(row.tripId);

  if (candidateIds.size === 0) return [];

  // ── Step 2. Fetch the candidate trips with full display columns. ───
  return buildTripSelect(tx, Array.from(candidateIds));
}

/** Row shape returned by the public_trips select. Exported for callers
 *  that need to consume the trip rows independently of `enrichTripsWithProfiles`. */
export interface PublicTripRow {
  id: string;
  user_id: string;
  kind: 'request' | 'offer';
  route: string[];
  travel_date: string;
  airline: string | null;
  flight_numbers: string[] | null;
  languages: string[];
  gender_preference: 'any' | 'male' | 'female' | null;
  help_categories: string[];
  thank_you_eur: number | null;
  status: 'open' | 'matched' | 'completed' | 'cancelled';
  traveller_age_bands: string[];
  traveller_count: number;
  created_at: string;
}

async function buildTripSelect(tx: DbTx, tripIds: string[]): Promise<PublicTripRow[]> {
  const rows = await tx
    .select({
      id: publicTrips.id,
      user_id: publicTrips.userId,
      kind: publicTrips.kind,
      route: publicTrips.route,
      travel_date: publicTrips.travelDate,
      airline: publicTrips.airline,
      flight_numbers: publicTrips.flightNumbers,
      languages: publicTrips.languages,
      gender_preference: publicTrips.genderPreference,
      help_categories: publicTrips.helpCategories,
      thank_you_eur: publicTrips.thankYouEur,
      status: publicTrips.status,
      traveller_age_bands: publicTrips.travellerAgeBands,
      traveller_count: publicTrips.travellerCount,
      created_at: publicTrips.createdAt,
    })
    .from(publicTrips)
    .where(and(inArray(publicTrips.id, tripIds), eq(publicTrips.status, 'open')));
  // The view columns are inferred nullable (drizzle-kit pulls views as
  // nullable); the underlying base columns aren't, and our app contracts
  // them as required. Cast at the boundary.
  return rows as unknown as PublicTripRow[];
}

/** Minimal profile shape needed to render a trip card. */
export interface TripPosterProfile {
  display_name: string | null;
  photo_url: string | null;
  primary_language: string;
}

/**
 * Attach poster-profile context to each trip so it can render as a
 * TripCard. Does a single batched `in()` query instead of N profile
 * lookups — important when a search returns dozens of trips from
 * different users.
 *
 * Returns the trips as `RankableTrip` rows with a `.card` property
 * ready for `<TripCard>`, plus a `.kind` discriminant for splitting
 * requests vs offers in the UI.
 */
export async function enrichTripsWithProfiles(
  tx: DbTx,
  trips: readonly PublicTripRow[],
): Promise<Array<RankableTrip & { kind: 'request' | 'offer'; card: TripCardData }>> {
  const userIds = Array.from(new Set(trips.map((tr) => tr.user_id)));
  const profilesById = new Map<string, TripPosterProfile>();

  if (userIds.length > 0) {
    const ps = await tx
      .select({
        id: publicProfiles.id,
        displayName: publicProfiles.displayName,
        photoUrl: publicProfiles.photoUrl,
        primaryLanguage: publicProfiles.primaryLanguage,
      })
      .from(publicProfiles)
      .where(inArray(publicProfiles.id, userIds));
    for (const p of ps) {
      if (!p.id) continue;
      profilesById.set(p.id, {
        display_name: p.displayName,
        photo_url: p.photoUrl,
        primary_language: p.primaryLanguage ?? '',
      });
    }
  }

  return trips.map((tr) => {
    const p = profilesById.get(tr.user_id);
    const card: TripCardData = {
      id: tr.id,
      kind: tr.kind,
      display_name: p?.display_name ?? 'Anonymous',
      photo_url: p?.photo_url ?? null,
      languages: tr.languages,
      primary_language: p?.primary_language ?? null,
      route: tr.route,
      travel_date: tr.travel_date,
      traveller_age_bands: tr.traveller_age_bands ?? [],
      traveller_count: tr.traveller_count ?? 0,
      help_categories: tr.help_categories,
      thank_you_eur: tr.thank_you_eur,
      airline: tr.airline,
      flight_numbers: tr.flight_numbers ?? null,
    };
    return {
      id: tr.id,
      user_id: tr.user_id,
      route: tr.route,
      travel_date: tr.travel_date,
      languages: tr.languages,
      primary_language: p?.primary_language ?? null,
      flight_numbers: tr.flight_numbers ?? null,
      kind: tr.kind,
      card,
    };
  });
}
