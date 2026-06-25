/**
 * Date helpers shared across server and client code. Kept free of
 * `server-only` / `client-only` imports so both server code (`lib/search.ts`)
 * and client components can import from here.
 */

/**
 * Compute ISO-formatted start + end dates bracketing `centre` by
 * `days` days in each direction. Used as the travel_date window for
 * route-only searches (flight-number searches ignore the window).
 *
 * Returns strings in `YYYY-MM-DD` format, truncated from the full
 * ISO-8601 timestamp. UTC is used deliberately — we don't want the
 * window to shift by timezone.
 *
 *   dateWindow('2026-04-14', 1) → { start: '2026-04-13', end: '2026-04-15' }
 */
export function dateWindow(centre: string, days: number): { start: string; end: string } {
  const c = new Date(`${centre}T00:00:00Z`);
  const ms = days * 86_400_000;
  return {
    start: new Date(c.getTime() - ms).toISOString().slice(0, 10),
    end: new Date(c.getTime() + ms).toISOString().slice(0, 10),
  };
}
