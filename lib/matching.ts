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
 *     reviews (count capped at 10 × avg/5):           0..10
 *
 * History: an earlier revision of this scorer also rewarded
 * "verified_channel_count" at +3 per channel. That table was removed in
 * 0009_profile_schema_cleanup — the signal was noisy (every Google sign-in
 * counted the same as a real LinkedIn) and didn't correlate with trip
 * quality. The scorer now leans entirely on language + route + date + reviews.
 */

import { canonicalFlight } from '@/lib/flight';

export interface RankableTrip {
  id: string;
  user_id: string;
  route: string[];
  travel_date: string; // ISO date 'YYYY-MM-DD'
  languages: string[];
  primary_language?: string | null;
  flight_numbers?: string[] | null;
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
  const oIdx = tripRoute.indexOf(origin);
  const dIdx = tripRoute.indexOf(destination);
  const inOrder = oIdx !== -1 && dIdx !== -1 && dIdx > oIdx;

  if (inOrder) {
    const sameEndpoints = oIdx === 0 && dIdx === tripRoute.length - 1;
    if (sameEndpoints) return tripRoute.length === 2 ? 'exact' : 'endpoints';
    return 'endpoints';
  }

  // One-leg overlap: origin appears as a departure (not the final
  // airport), OR destination appears as an arrival (not the first).
  // Direction-safe: a reverse-leg traveller doesn't satisfy either.
  if ((oIdx !== -1 && oIdx < tripRoute.length - 1) || (dIdx !== -1 && dIdx > 0)) {
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

/** Returns the set of flight numbers that appear on both sides. */
export function matchingFlightNumbers(
  tripFlights: readonly string[] | null | undefined,
  searcherFlights: readonly string[] | null | undefined,
): string[] {
  if (!tripFlights || !searcherFlights) return [];
  const searcherSet = new Set(searcherFlights.map(canonicalFlight));
  return tripFlights.filter((fn) => searcherSet.has(canonicalFlight(fn)));
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
 *
 * The date window applies in both modes — a flight number alone does
 * not identify a specific aircraft (QR540 is a daily flight; same
 * number on different days = different plane). When flightNumbers is
 * provided, trips must match both the date window AND at least one
 * flight number.
 */
export function rankTrips<T extends RankableTrip>(
  trips: readonly T[],
  criteria: SearchCriteria,
): Scored<T>[] {
  const usingFlightFilter = !!criteria.flightNumbers && criteria.flightNumbers.length > 0;

  return trips
    .filter((t) => {
      if (dayDiff(t.travel_date, criteria.date) > criteria.dateWindowDays) return false;
      if (usingFlightFilter) {
        return matchingFlightNumbers(t.flight_numbers, criteria.flightNumbers).length > 0;
      }
      return true;
    })
    .map((t) => scoreTrip(t, criteria))
    .sort((a, b) => b.score - a.score);
}
