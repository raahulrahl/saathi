/**
 * Trip ranking. See Product Spec §3.5.
 *
 * Matching philosophy (updated 2026-04):
 *   The thing Saathi is actually matching is "two people on the same
 *   aircraft". A ±3-day date window on a shared route produced false
 *   matches — students flying CCU→AMS on the 10th can't help a parent
 *   on the 14th, even if both post those endpoints. So flight number
 *   is now the primary match criterion.
 *
 *   Filter cascade:
 *     1. If the searcher provides flight numbers, only trips with a
 *        matching flight number on at least one leg pass the filter.
 *     2. Otherwise the trip must fall inside `dateWindowDays` of the
 *        requested date (default 1 to cover red-eyes and timezone fuzz,
 *        not general browsing).
 *
 *   Scoring within the filter, highest to lowest:
 *     flight-number exact match (same leg, same flight):   +200
 *     language: primary match                              +100
 *     language: any shared                                  +40
 *     language: no overlap                                    0
 *     route: exact two-leg match                            +25
 *     route: same endpoints, different layovers             +15
 *     route: one-leg overlap                                 +5
 *     date delta:                                -5 per day
 *     verifications (capped at 4):                  +3 per channel
 *     reviews (count capped at 10 × avg/5):           0..10
 */

export interface RankableTrip {
  id: string;
  user_id: string;
  route: string[];
  travel_date: string; // ISO date 'YYYY-MM-DD'
  languages: string[];
  primary_language?: string | null;
  flight_numbers?: string[] | null;
  verified_channel_count?: number;
  review_count?: number;
  average_rating?: number | null;
}

export interface SearchCriteria {
  origin: string;
  destination: string;
  date: string; // ISO 'YYYY-MM-DD'
  dateWindowDays: number; // default 1
  flightNumbers?: string[]; // when provided, exact-match is required
  viewerLanguages?: string[];
  viewerPrimaryLanguage?: string | null;
}

export type LanguageBand = 'primary' | 'shared' | 'none';

export interface Scored<T extends RankableTrip = RankableTrip> {
  trip: T;
  score: number;
  band: LanguageBand;
  matchedLanguages: string[];
  dayDelta: number;
  routeMatch: 'exact' | 'endpoints' | 'one-leg' | 'none';
  flightMatch: boolean; // true when at least one flight number matches
  matchedFlightNumbers: string[];
}

/** Difference in days, ignoring timezone. */
export function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(Math.abs(da - db) / 86_400_000);
}

export function routeMatch(
  tripRoute: string[],
  origin: string,
  destination: string,
): Scored['routeMatch'] {
  if (tripRoute.length < 2) return 'none';
  const start = tripRoute[0]!;
  const end = tripRoute[tripRoute.length - 1]!;
  if (start === origin && end === destination) {
    return tripRoute.length === 2 ? 'exact' : 'endpoints';
  }
  if (tripRoute.includes(origin) && tripRoute.includes(destination)) {
    return 'endpoints';
  }
  if (
    start === origin ||
    end === destination ||
    tripRoute.includes(origin) ||
    tripRoute.includes(destination)
  ) {
    return 'one-leg';
  }
  return 'none';
}

export function languageBand(
  tripLanguages: string[],
  tripPrimary: string | null | undefined,
  viewerLanguages: string[],
  viewerPrimary: string | null | undefined,
): { band: LanguageBand; matched: string[] } {
  const vset = new Set(viewerLanguages.map((l) => l.toLowerCase()));
  const tset = tripLanguages.map((l) => l.toLowerCase());
  const matched = tripLanguages.filter((l) => vset.has(l.toLowerCase()));

  const primaryMatch =
    !!tripPrimary && !!viewerPrimary && tripPrimary.toLowerCase() === viewerPrimary.toLowerCase();

  const anyMatch = matched.length > 0 || tset.some((l) => vset.has(l));

  if (primaryMatch) return { band: 'primary', matched };
  if (anyMatch) return { band: 'shared', matched };
  return { band: 'none', matched: [] };
}

/** Normalise flight numbers for comparison: uppercase, strip whitespace. */
function normaliseFlight(fn: string): string {
  return fn.trim().toUpperCase().replace(/\s+/g, '');
}

/** Returns the set of flight numbers that appear on both sides. */
export function matchingFlightNumbers(
  tripFlights: readonly string[] | null | undefined,
  searcherFlights: readonly string[] | null | undefined,
): string[] {
  if (!tripFlights || !searcherFlights) return [];
  const searcherSet = new Set(searcherFlights.map(normaliseFlight));
  return tripFlights.filter((fn) => searcherSet.has(normaliseFlight(fn)));
}

export function scoreTrip<T extends RankableTrip>(trip: T, criteria: SearchCriteria): Scored<T> {
  const { band, matched } = languageBand(
    trip.languages,
    trip.primary_language,
    criteria.viewerLanguages ?? [],
    criteria.viewerPrimaryLanguage,
  );

  const rm = routeMatch(trip.route, criteria.origin, criteria.destination);
  const delta = dayDiff(trip.travel_date, criteria.date);

  const matchedFlights = matchingFlightNumbers(trip.flight_numbers, criteria.flightNumbers);
  const flightMatch = matchedFlights.length > 0;

  let score = 0;
  if (flightMatch) score += 200;
  if (band === 'primary') score += 100;
  else if (band === 'shared') score += 40;

  score += rm === 'exact' ? 25 : rm === 'endpoints' ? 15 : rm === 'one-leg' ? 5 : 0;
  score -= delta * 5;

  const verifCap = Math.min(trip.verified_channel_count ?? 0, 4);
  score += verifCap * 3;

  const reviewCap = Math.min(trip.review_count ?? 0, 10);
  const avg = trip.average_rating ?? 0;
  score += reviewCap * (avg / 5);

  return {
    trip,
    score,
    band,
    matchedLanguages: matched,
    dayDelta: delta,
    routeMatch: rm,
    flightMatch,
    matchedFlightNumbers: matchedFlights,
  };
}

/**
 * Filter + rank trips.
 *   - If `criteria.flightNumbers` is non-empty, only trips with at least one
 *     matching flight number pass. Date window is ignored in this mode —
 *     flight numbers already uniquely identify the departure.
 *   - Otherwise, trips must fall within `criteria.dateWindowDays` of the
 *     requested date.
 */
export function rankTrips<T extends RankableTrip>(
  trips: readonly T[],
  criteria: SearchCriteria,
): Scored<T>[] {
  const usingFlightFilter = !!criteria.flightNumbers && criteria.flightNumbers.length > 0;

  return trips
    .filter((t) => {
      if (usingFlightFilter) {
        return matchingFlightNumbers(t.flight_numbers, criteria.flightNumbers).length > 0;
      }
      return dayDiff(t.travel_date, criteria.date) <= criteria.dateWindowDays;
    })
    .map((t) => scoreTrip(t, criteria))
    .sort((a, b) => b.score - a.score);
}
