import 'server-only';

import { and, eq, gte, inArray, lte, ne, or, type SQL } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { tripLegs, trips } from '@/lib/db/schema';
import { dateWindow } from '@/lib/dates';

/**
 * Auto-match: after a trip is created, find existing open trips that
 * could be a match and return them so we can notify those users.
 *
 * Matching runs on `trip_legs` (added in migration 0016) — one row per
 * consecutive airport pair in a trip's route. For each leg of the new
 * trip, we look for overlapping legs on other open trips of the
 * opposite kind:
 *
 *   1. Same (flight_number, travel_date) — strongest signal; same
 *      physical aircraft on the same day.
 *   2. Same (origin, destination, travel_date ± 1 day) — same directed
 *      route leg on the same day (± a day to cover redeyes and TZ fuzz).
 *
 * Anything else (partial endpoint overlap, same city different plane,
 * etc.) does not auto-notify — too noisy. Those still surface on the
 * search page where the user is actively browsing.
 *
 * Uses withService because we need to read across all users' trips, not
 * just the poster's.
 */

const DATE_WINDOW_DAYS = 1;

export interface NewTripInfo {
  id: string;
  user_id: string;
  kind: 'request' | 'offer';
  route: string[];
  travel_date: string;
  flight_numbers: string[];
  languages: string[];
}

export interface MatchedTrip {
  id: string;
  user_id: string;
  kind: 'request' | 'offer';
  route: string[];
  travel_date: string;
  flight_numbers: string[] | null;
}

/** Build the (origin, destination, flight_number) legs for a new trip. */
function newTripLegs(trip: NewTripInfo): Array<{
  origin: string;
  destination: string;
  flight_number: string | null;
}> {
  const legs: ReturnType<typeof newTripLegs> = [];
  for (let i = 0; i < trip.route.length - 1; i++) {
    legs.push({
      origin: trip.route[i]!,
      destination: trip.route[i + 1]!,
      flight_number: trip.flight_numbers[i] ?? null,
    });
  }
  return legs;
}

export async function findMatchingTrips(newTrip: NewTripInfo): Promise<MatchedTrip[]> {
  const oppositeKind = newTrip.kind === 'request' ? 'offer' : 'request';

  const legs = newTripLegs(newTrip);
  if (legs.length === 0) return [];

  const { start, end } = dateWindow(newTrip.travel_date, DATE_WINDOW_DAYS);
  const flightNumbers = legs.map((l) => l.flight_number).filter((fn): fn is string => !!fn);

  return withService(async (tx) => {
    const candidateIds = new Set<string>();

    // 1. Flight-number matches.
    if (flightNumbers.length > 0) {
      try {
        const flightHits = await tx
          .select({ tripId: tripLegs.tripId })
          .from(tripLegs)
          .where(
            and(
              inArray(tripLegs.flightNumber, flightNumbers),
              gte(tripLegs.travelDate, start),
              lte(tripLegs.travelDate, end),
            ),
          );
        for (const row of flightHits) candidateIds.add(row.tripId);
      } catch (err) {
        console.error('[auto-match] flight-leg query failed:', (err as Error).message);
      }
    }

    // 2. (origin, destination, date) matches — issued as a single query
    // using an OR of per-leg predicates. Fewer round-trips than one-per-leg,
    // and each OR branch resolves to trip_legs_od_date_idx.
    const odPredicates: SQL[] = legs.map(
      (l) => and(eq(tripLegs.origin, l.origin), eq(tripLegs.destination, l.destination))!,
    );
    try {
      const odHits = await tx
        .select({ tripId: tripLegs.tripId })
        .from(tripLegs)
        .where(
          and(or(...odPredicates), gte(tripLegs.travelDate, start), lte(tripLegs.travelDate, end)),
        );
      for (const row of odHits) candidateIds.add(row.tripId);
    } catch (err) {
      console.error('[auto-match] od-leg query failed:', (err as Error).message);
    }

    if (candidateIds.size === 0) return [];

    // 3. Fetch the candidate trips themselves, filtered down to opposite
    // kind, open status, not-self. Belt-and-suspenders — the leg match
    // already scoped by date, but we still need to exclude closed / own
    // trips.
    try {
      const rows = await tx
        .select({
          id: trips.id,
          user_id: trips.userId,
          kind: trips.kind,
          route: trips.route,
          travel_date: trips.travelDate,
          flight_numbers: trips.flightNumbers,
        })
        .from(trips)
        .where(
          and(
            inArray(trips.id, Array.from(candidateIds)),
            eq(trips.status, 'open'),
            eq(trips.kind, oppositeKind),
            ne(trips.userId, newTrip.user_id),
          ),
        );
      console.log(`[auto-match] found ${rows.length} matching trips for ${newTrip.id}`);
      return rows as MatchedTrip[];
    } catch (err) {
      console.error('[auto-match] trip fetch failed:', (err as Error).message);
      return [];
    }
  });
}
