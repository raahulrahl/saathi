/**
 * Trip ranking. See Product Spec §3.5.
 *
 * We do NOT filter aggressively — the search result page needs to show a
 * no-shared-language match if that's what's available, just visually
 * de-emphasized. The caller sorts results by `score` descending and decides
 * how to render each bucket (primary_language > shared > no overlap).
 *
 * Weights were chosen so that a perfect language match three days off the
 * requested date beats an English-only match on the exact date:
 *
 *   primary_language match → +100
 *   any shared language    → +40  (bigger gap on purpose; see §2 "Why language")
 *   no shared language     → 0
 *
 *   date delta:   -5 per day (so ±3 days costs at most 15)
 *   route exact:  +25; shared both ends, different layovers: +15; one-leg: +5
 *   verifications: +3 per verified channel (cap at 12)
 *   review score:  average_rating * review_count_capped (cap at 10) — modest bump
 */

export interface RankableTrip {
  id: string;
  user_id: string;
  route: string[];
  travel_date: string; // ISO date 'YYYY-MM-DD'
  languages: string[];
  primary_language?: string | null;
  verified_channel_count?: number;
  review_count?: number;
  average_rating?: number | null;
}

export interface SearchCriteria {
  origin: string;
  destination: string;
  date: string; // ISO 'YYYY-MM-DD'
  dateWindowDays: number; // spec v1 = 3
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

export function scoreTrip<T extends RankableTrip>(trip: T, criteria: SearchCriteria): Scored<T> {
  const { band, matched } = languageBand(
    trip.languages,
    trip.primary_language,
    criteria.viewerLanguages ?? [],
    criteria.viewerPrimaryLanguage,
  );

  const rm = routeMatch(trip.route, criteria.origin, criteria.destination);
  const delta = dayDiff(trip.travel_date, criteria.date);

  let score = 0;
  if (band === 'primary') score += 100;
  else if (band === 'shared') score += 40;
  // 'none' → 0

  score += rm === 'exact' ? 25 : rm === 'endpoints' ? 15 : rm === 'one-leg' ? 5 : 0;
  score -= delta * 5;

  const verifCap = Math.min(trip.verified_channel_count ?? 0, 4);
  score += verifCap * 3;

  const reviewCap = Math.min(trip.review_count ?? 0, 10);
  const avg = trip.average_rating ?? 0;
  score += reviewCap * (avg / 5); // 0..10 range

  return {
    trip,
    score,
    band,
    matchedLanguages: matched,
    dayDelta: delta,
    routeMatch: rm,
  };
}

/** Filter to the date window, then score and sort descending. */
export function rankTrips<T extends RankableTrip>(
  trips: readonly T[],
  criteria: SearchCriteria,
): Scored<T>[] {
  return trips
    .filter((t) => dayDiff(t.travel_date, criteria.date) <= criteria.dateWindowDays)
    .map((t) => scoreTrip(t, criteria))
    .sort((a, b) => b.score - a.score);
}
