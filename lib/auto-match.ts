import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { dateWindow } from '@/lib/dates';

/**
 * Auto-match: after a trip is created, find existing open trips that
 * could be a match and return them so we can notify those users.
 *
 * Match criteria mirrors the search page:
 *   - If the new trip has flight numbers → exact flight-number overlap
 *   - Otherwise → same route endpoints within ±1 day
 *   - Opposite kind (new request → find offers, new offer → find requests)
 *   - Different user (don't self-match)
 *   - Status = 'open' only
 *
 * Uses the service-role client because we need to read across all users'
 * trips, not just the poster's.
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

export async function findMatchingTrips(newTrip: NewTripInfo): Promise<MatchedTrip[]> {
  const supabase = createSupabaseServiceClient();
  const oppositeKind = newTrip.kind === 'request' ? 'offer' : 'request';

  const origin = newTrip.route[0]!;
  const destination = newTrip.route[newTrip.route.length - 1]!;

  let query = supabase
    .from('trips')
    .select('id, user_id, kind, route, travel_date, flight_numbers')
    .eq('status', 'open')
    .eq('kind', oppositeKind)
    .neq('user_id', newTrip.user_id)
    .contains('route', [origin])
    .contains('route', [destination]);

  if (newTrip.flight_numbers.length > 0) {
    // Exact flight-number match via GIN overlap — date window not needed.
    query = query.overlaps('flight_numbers', newTrip.flight_numbers);
  } else {
    // Route-only match within ±1 day.
    const { start, end } = dateWindow(newTrip.travel_date, DATE_WINDOW_DAYS);
    query = query.gte('travel_date', start).lte('travel_date', end);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[auto-match] query failed:', error.message);
    return [];
  }

  console.log(`[auto-match] found ${data?.length ?? 0} matching trips for ${newTrip.id}`);
  return (data ?? []) as MatchedTrip[];
}
