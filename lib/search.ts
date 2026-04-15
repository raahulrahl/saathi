import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripCardData } from '@/components/trip-card';
import type { RankableTrip } from '@/lib/matching';

/**
 * Server-side search helpers. Extracted from `app/search/page.tsx` so the
 * page file can stay focused on the route shape + rendering, and so the
 * peek widget / any future search surface can share the same primitives.
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
export async function fetchViewerProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string | null,
): Promise<ViewerProfile> {
  if (!userId) return { role: null, languages: [], primaryLanguage: null };
  const { data } = await supabase
    .from('profiles')
    .select('role, languages, primary_language')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return { role: null, languages: [], primaryLanguage: null };
  const role =
    data.role === 'family' || data.role === 'companion'
      ? (data.role as 'family' | 'companion')
      : null;
  return {
    role,
    languages: Array.isArray(data.languages) ? (data.languages as string[]) : [],
    primaryLanguage: data.primary_language ?? null,
  };
}

export interface TripQueryParams {
  from: string;
  to: string;
  /** ISO YYYY-MM-DD. Ignored when flightNumbers is non-empty. */
  date: string;
  flightNumbers: string[];
  dateWindowDays?: number;
}

/**
 * Run the public_trips query for a given route + date / flight numbers.
 * Two modes:
 *
 *   - flightNumbers non-empty: strict exact-flight match via GIN index
 *     overlap. Date is ignored — flight number is already more specific.
 *   - flightNumbers empty: same route within ±dateWindowDays of `date`.
 *
 * Always filters to status='open' (closed trips shouldn't surface).
 * Returns the raw trips array; call `enrichTripsWithProfiles` next to
 * attach display data.
 */
export async function fetchTripsForSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: TripQueryParams,
) {
  const windowDays = params.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS;
  const { start, end } = dateWindow(params.date, windowDays);

  let query = supabase
    .from('public_trips')
    .select(
      `id, user_id, kind, route, travel_date, airline, flight_numbers,
       languages, gender_preference, help_categories, thank_you_eur, notes,
       status, elderly_age_band, created_at`,
    )
    .eq('status', 'open')
    .contains('route', [params.from])
    .contains('route', [params.to]);

  if (params.flightNumbers.length > 0) {
    query = query.overlaps('flight_numbers', params.flightNumbers);
  } else {
    query = query.gte('travel_date', start).lte('travel_date', end);
  }

  return query;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trips: readonly any[],
): Promise<Array<RankableTrip & { kind: 'request' | 'offer'; card: TripCardData }>> {
  const userIds = Array.from(new Set(trips.map((tr) => tr.user_id)));
  const profilesById = new Map<string, TripPosterProfile>();

  if (userIds.length > 0) {
    const { data: ps } = await supabase
      .from('public_profiles')
      .select('id, display_name, photo_url, primary_language')
      .in('id', userIds);
    (ps ?? []).forEach((p) =>
      profilesById.set(p.id, {
        display_name: p.display_name,
        photo_url: p.photo_url,
        primary_language: p.primary_language,
      }),
    );
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
      elderly_age_band: tr.elderly_age_band,
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

/**
 * Compute ISO-formatted start + end dates bracketing `centre` by
 * `days` days in each direction. Used as the travel_date window for
 * route-only searches (flight-number searches ignore the window).
 */
export function dateWindow(centre: string, days: number): { start: string; end: string } {
  const c = new Date(`${centre}T00:00:00Z`);
  const ms = days * 86_400_000;
  return {
    start: new Date(c.getTime() - ms).toISOString().slice(0, 10),
    end: new Date(c.getTime() + ms).toISOString().slice(0, 10),
  };
}
