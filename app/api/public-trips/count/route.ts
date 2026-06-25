import { NextResponse, type NextRequest } from 'next/server';
import { and, arrayOverlaps, eq, gte, lte, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db';
import { publicTrips } from '@/lib/db/schema';
import { dateWindow } from '@/lib/dates';

/**
 * Public trip-count endpoint for client components that can't talk to the
 * DB directly. Replaces the per-component `createClient(...)` shims in
 * peek-widget.tsx and flight-composer.tsx that read public_trips with the
 * anon key — Drizzle/postgres.js are server-only.
 *
 * Runs as anon (withUser(null)) so security_invoker on public_trips +
 * the anon column grants govern what's visible — exactly the same trust
 * boundary as the old browser query.
 *
 * Query params:
 *   from         IATA code, required
 *   to           IATA code, required
 *   date         YYYY-MM-DD, required
 *   windowDays   integer (default 3) — ±N day window around `date`. Ignored
 *                if `flights` is provided (then flight-number match is used
 *                instead of a date window).
 *   flights      comma-separated flight numbers. Optional. When present,
 *                matches trips whose `flight_numbers` array overlaps any
 *                of the given codes (no date window applied).
 *   kind         'offer' | 'request' | 'both' (default). Filter to one
 *                kind, or return separate counts for both.
 *
 * Response:
 *   { offers: number, requests: number, total: number }
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = (sp.get('from') ?? '').toUpperCase();
  const to = (sp.get('to') ?? '').toUpperCase();
  const date = sp.get('date') ?? '';
  const windowDays = Math.max(0, Math.min(7, Number(sp.get('windowDays') ?? 3)));
  const flightsParam = sp.get('flights');
  const flights = flightsParam
    ? flightsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const kind = sp.get('kind') ?? 'both';

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const { offers, requests } = await withUser(null, async (tx) => {
      // route contains BOTH airports (so partial-leg helpers count too).
      // `@>` is PG's array-contains operator.
      const routeContains = and(
        sql`${publicTrips.route} @> ARRAY[${from}]::text[]`,
        sql`${publicTrips.route} @> ARRAY[${to}]::text[]`,
      )!;
      const dateFilter =
        flights.length > 0
          ? arrayOverlaps(publicTrips.flightNumbers, flights)
          : (() => {
              const { start, end } = dateWindow(date, windowDays);
              return and(gte(publicTrips.travelDate, start), lte(publicTrips.travelDate, end))!;
            })();

      async function countForKind(k: 'offer' | 'request'): Promise<number> {
        const rows = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(publicTrips)
          .where(
            and(eq(publicTrips.status, 'open'), eq(publicTrips.kind, k), routeContains, dateFilter),
          );
        return rows[0]?.c ?? 0;
      }

      // Sequential inside one tx — postgres.js serializes statements per
      // connection anyway, and these are sub-millisecond on two indexed
      // counts.
      const offers = kind === 'request' ? 0 : await countForKind('offer');
      const requests = kind === 'offer' ? 0 : await countForKind('request');
      return { offers, requests };
    });

    return NextResponse.json({
      offers,
      requests,
      total: offers + requests,
    });
  } catch (err) {
    console.error('[public-trips/count] query failed:', (err as Error).message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
