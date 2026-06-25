import { Badge } from '@/components/ui/badge';
import type { Scored } from '@/lib/matching';
import { canonicalFlight } from '@/lib/flight';

/**
 * Plain-English translation of a Scored result's matching band. Lives
 * on the companion card in the family-side shortlist so the family
 * sees *why* this person is shown — "Also on QR540 + QR23" is far more
 * useful than a numeric score.
 *
 * Bands in order of strength:
 *   1. flight_number match        — "Also on QR540 + QR23"        matcha
 *   2. same (o, d, date)          — "Also going CCU → AMS on D"   slushie
 *   3. same (o, d), ±N days       — "Same route, 1 day apart"     slushie
 *   4. one-leg overlap            — "Can help on part of your ..." muted
 *   5. fallback                   — "Nearby route"                 muted
 */

interface EvidenceBadgeProps {
  scored: Scored;
  /** Searcher's origin. Used to build the exact-match badge text. */
  origin: string;
  /** Searcher's destination. Same as above. */
  destination: string;
  /** ISO YYYY-MM-DD. Formatted to "Apr 20" for display. */
  date: string;
}

export function EvidenceBadge({ scored, origin, destination, date }: EvidenceBadgeProps) {
  if (scored.flightMatch) {
    const flights = scored.matchedFlightNumbers.map(canonicalFlight).join(' + ');
    return <Badge variant="matcha">● Also on {flights}</Badge>;
  }

  if (scored.routeMatch === 'exact' || scored.routeMatch === 'endpoints') {
    if (scored.dayDelta === 0) {
      return (
        <Badge variant="slushie">
          ● Also going {origin} → {destination} on {formatShortDate(date)}
        </Badge>
      );
    }
    return (
      <Badge variant="slushie">
        ● Same route, {scored.dayDelta} day{scored.dayDelta > 1 ? 's' : ''} apart
      </Badge>
    );
  }

  if (scored.routeMatch === 'one-leg') {
    return <Badge variant="muted">● Can help on part of your journey</Badge>;
  }

  return <Badge variant="muted">● Nearby route</Badge>;
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
