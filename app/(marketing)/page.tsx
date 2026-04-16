import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { ArrowRight, Calendar, Clock, Plane } from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { FlightComposer } from '@/components/flight-composer';
import { RotatingWord } from '@/components/rotating-word';
import { WorldGlobeClient } from '@/components/world-globe-client';
import { TripCard, type TripCardData } from '@/components/trip-card';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankTrips, type RankableTrip, type Scored } from '@/lib/matching';
import { isValidIata, AIRPORTS } from '@/lib/iata';
import {
  DEFAULT_DATE_WINDOW_DAYS,
  enrichTripsWithProfiles,
  fetchTripsForSearch,
  fetchViewerProfile,
  type ViewerProfile,
} from '@/lib/search';

/**
 * Home is the merged landing + browse page.
 *
 * One URL, two jobs:
 *   - Cold visitor: hero + story (peek, notice, example post, marquee, CTA)
 *     frames what Saathi is and why it exists. Popular routes and "fresh
 *     on Saathi" panels seeded from the DB prove the service is alive.
 *   - Warm visitor with a route in mind: the hero composer accepts the
 *     same query params as the old /browse page (?from=&to=&date=&fn=).
 *     When all three are valid, the results render below the composer
 *     instead of the onboarding panels.
 *
 * /browse still exists as a redirect for any bookmarks or shared links.
 */

// Always fresh — the popular-routes and activity panels pull from live DB.
export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string; fn?: string }>;
}

const CITY_BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a.city]));

export default async function LandingPage({ searchParams }: HomeProps) {
  const { from = '', to = '', date = '', fn = '' } = await searchParams;
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  const flightNumbers = parseFlightNumbers(fn);
  const validSearch = isValidIata(f) && isValidIata(t) && !!date;

  // Viewer role — used by the composer to flip the submit target between
  // family/companion posting flows.
  let viewerRole: 'family' | 'companion' | null = null;
  const { userId } = await auth();
  if (userId) {
    const supabase = await createSupabaseServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.role === 'family' || profile?.role === 'companion') {
      viewerRole = profile.role;
    }
  }

  return (
    <div className="flex flex-col">
      {/* ─── Hero — two variants ──────────────────────────────────────
          Cold landing: the full emotional pitch with the hero composer.
          Active search: a compact header that keeps the composer editable
          but doesn't dominate the page above the results.
         ────────────────────────────────────────────────────────────── */}
      {validSearch ? (
        <section className="border-b border-oat">
          <div className="container max-w-5xl py-6 md:py-8">
            <div className="mb-4">
              <p className="clay-label">Browse</p>
              <h1 className="mt-1 font-serif text-2xl md:text-3xl">
                <span className="font-mono">{f}</span>{' '}
                <span className="text-muted-foreground">→</span>{' '}
                <span className="font-mono">{t}</span>
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  · {format(parseISO(date), 'd LLL yyyy')}
                </span>
              </h1>
            </div>
            <FlightComposer
              variant="compact"
              defaultMode="seek"
              viewerRole={viewerRole}
              {...(f && t ? { defaultRoute: [f, t] } : {})}
              {...(date ? { defaultDate: date } : {})}
              {...(flightNumbers.length > 0 ? { defaultFlightNumbers: flightNumbers } : {})}
            />
          </div>
        </section>
      ) : (
        <section>
          <div className="container flex flex-col items-center gap-10 py-16 md:py-20">
            <div className="flex max-w-3xl flex-col items-center gap-5 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-oat bg-white px-3 py-1 text-xs font-medium text-warm-charcoal">
                <span className="font-semibold text-marigold-700">साथी</span> · a little community
                for travel days
              </span>
              <h1 className="max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-5xl lg:text-[56px]">
                Find someone kind on{' '}
                <RotatingWord
                  words={["Ma's", "father's", "wife's", "husband's", "Dadi's", "your loved one's"]}
                  interval={2500}
                  className="text-marigold-700"
                />{' '}
                flight.
              </h1>
              <p className="max-w-2xl text-balance text-lg leading-relaxed text-warm-charcoal">
                Saathi is a small community of travellers who look out for each other&rsquo;s loved
                ones through unfamiliar airports. Tell us the flight — we&rsquo;ll find someone who
                speaks her language.
              </p>
            </div>

            <FlightComposer
              variant="hero"
              defaultMode="seek"
              viewerRole={viewerRole}
              className="max-w-4xl"
            />
          </div>
        </section>
      )}

      {/* ─── Middle band — search results OR discovery panels ─────── */}
      {/*
        New order (cold landing):
          1. Hero + composer (above)
          2. Globe — the visual payoff, right after the composer
          3. Popular routes — data-driven one-click search starters
          4. Fresh on Saathi — live activity feed
          5. Marquee — ambient community vibes
          6. Closing CTA

        Removed:
          - Peek widget (redundant with the hero composer)
          - Notice card + example post (moved to /about where they belong)
      */}
      {validSearch ? (
        <Suspense
          fallback={<div className="container py-10 text-sm text-muted-foreground">Loading…</div>}
        >
          <Results
            from={f}
            to={t}
            date={date}
            flightNumbers={flightNumbers}
            userId={userId ?? null}
          />
        </Suspense>
      ) : (
        <>
          {/* Globe — immediately after the hero, biggest visual impact */}
          <Suspense fallback={null}>
            <WorldGlobeSection />
          </Suspense>

          {/* Popular routes + Fresh activity */}
          <Suspense
            fallback={<div className="container py-10 text-sm text-muted-foreground">Loading…</div>}
          >
            <DiscoveryPanels />
          </Suspense>

          {/* Marquee — ambient community strip */}
          <section className="py-12">
            <div className="container mb-4 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-warm-silver">
                Around today
              </p>
            </div>

            <div
              className="relative overflow-hidden"
              style={{
                maskImage:
                  'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
              }}
            >
              <ul className="flex w-max animate-marquee gap-8 py-2 hover:[animation-play-state:paused] md:gap-10">
                {[...AROUND_TODAY, ...AROUND_TODAY].map((entry, i) => (
                  <li
                    key={i}
                    className="flex shrink-0 items-center gap-2.5 text-sm leading-none text-warm-charcoal"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${entry.dot}`} aria-hidden />
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="text-warm-silver">·</span>
                    <span>{entry.language}</span>
                    <span className="text-warm-silver">·</span>
                    <span>{entry.location}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Closing CTA */}
          <section className="container pb-24 pt-4 text-center">
            <Link
              href="/dashboard/new/request"
              className="clay-hover inline-flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-semibold text-background"
            >
              Post a flight
            </Link>
            <p className="mt-3 text-sm text-warm-silver">Takes a minute. Free. Always will be.</p>
          </section>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// World globe — slowly-rotating Earth showing today's active routes
// ─────────────────────────────────────────────────────────────────────

async function WorldGlobeSection() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pull up to 50 upcoming open trips. Map each to its origin/destination
  // pair (drop layovers — too many arcs starts to look noisy on the globe).
  // Dedupe so duplicate routes render once.
  const { data } = await supabase
    .from('public_trips')
    .select('route')
    .eq('status', 'open')
    .gte('travel_date', today)
    .limit(50);

  const seenPairs = new Set<string>();
  const routes: string[][] = [];
  for (const row of data ?? []) {
    const r = (row as { route: string[] }).route;
    if (!r || r.length < 2) continue;
    const from = r[0]!;
    const to = r[r.length - 1]!;
    const key = `${from}->${to}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    routes.push([from, to]);
  }

  return (
    <section className="overflow-hidden border-y border-oat bg-gradient-to-b from-cream via-oat-light/30 to-cream">
      <div className="container grid items-center gap-10 py-16 md:grid-cols-[1fr_minmax(320px,440px)] md:py-20">
        <div className="max-w-md">
          <p className="clay-label">
            {routes.length > 0 ? 'Right now, on Saathi' : 'The world is waiting'}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight md:text-4xl">
            {routes.length > 0 ? (
              <>
                {routes.length} live route{routes.length === 1 ? '' : 's'} across the world.
              </>
            ) : (
              <>Be the first to draw an arc on this globe.</>
            )}
          </h2>
          <p className="mt-3 text-base text-warm-charcoal">
            {routes.length > 0
              ? 'Each arc is an open trip. Drag the globe — you might see your route already there.'
              : 'Post a trip and your route lights up for every family searching. It takes a minute.'}
          </p>
          <Link
            href="/dashboard/new/request"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-marigold-700 underline-offset-4 hover:underline"
          >
            {routes.length > 0 ? 'Add yours' : 'Post the first trip'}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-[440px]">
          <WorldGlobeClient routes={routes} />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Discovery panels — popular routes + fresh activity (no-search state)
// ─────────────────────────────────────────────────────────────────────

async function DiscoveryPanels() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const [recentRes, upcomingRes] = await Promise.all([
    supabase
      .from('public_trips')
      .select('id, kind, route, travel_date, airline, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('public_trips')
      .select('route, travel_date')
      .eq('status', 'open')
      .gte('travel_date', today)
      .limit(200),
  ]);

  const recent = (recentRes.data ?? []) as Array<{
    id: string;
    kind: 'request' | 'offer';
    route: string[];
    travel_date: string;
    airline: string | null;
    created_at: string;
  }>;

  const routeCounts = new Map<string, number>();
  for (const row of upcomingRes.data ?? []) {
    const r = (row as { route: string[] }).route;
    if (!r || r.length < 2) continue;
    const key = `${r[0]}→${r[r.length - 1]}`;
    routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
  }
  const topRoutes = [...routeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const [from, to] = key.split('→');
      return { from: from ?? '', to: to ?? '', count };
    });

  const hasAnyData = topRoutes.length > 0 || recent.length > 0;

  // When the DB is cold (zero trips), show an inviting empty state
  // instead of vanishing — a blank page between hero and marquee
  // reads as broken, not "early product."
  if (!hasAnyData) {
    return (
      <section className="container max-w-3xl py-16 text-center">
        <div className="rounded-3xl border border-dashed border-oat bg-gradient-to-b from-cream to-oat-light/30 p-10">
          <div className="mb-4 text-4xl" aria-hidden>
            🌼
          </div>
          <h2 className="font-serif text-2xl">No trips posted yet — you could be the first.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Flying somewhere? Post an offer so a family can find you. Sending a loved one? Post a
            request so someone kind on the same flight can keep them company.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild variant="lemon">
              <Link href="/dashboard/new/offer">Offer to help</Link>
            </Button>
            <Button asChild variant="slushie">
              <Link href="/dashboard/new/request">Post a request</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container max-w-5xl space-y-16 py-12">
      {/* Popular routes */}
      {topRoutes.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl">Popular routes right now</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap a route to pre-fill the search.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {routeCounts.size} distinct route{routeCounts.size === 1 ? '' : 's'} open
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topRoutes.map(({ from, to, count }) => {
              const defaultDate = new Date();
              defaultDate.setDate(defaultDate.getDate() + 7);
              const href = `/?from=${from}&to=${to}&date=${defaultDate.toISOString().slice(0, 10)}`;
              return (
                <Link
                  key={`${from}-${to}`}
                  href={href}
                  className="group flex items-center justify-between rounded-2xl border border-oat bg-card px-4 py-3 transition-all hover:border-matcha-600 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                      <span>{from}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span>{to}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {CITY_BY_IATA.get(from) ?? from} → {CITY_BY_IATA.get(to) ?? to}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-matcha-300/30 px-2 py-0.5 text-[11px] font-semibold text-matcha-800">
                    {count >= 5 ? `${count} open` : 'Active'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Fresh activity */}
      {recent.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl">Fresh on Saathi</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The {Math.min(recent.length, 8)} most recent trip{recent.length === 1 ? '' : 's'}{' '}
                posted.
              </p>
            </div>
          </div>

          <ul className="mt-5 divide-y divide-oat rounded-2xl border border-oat bg-card">
            {recent.slice(0, 8).map((trip) => {
              const from = trip.route[0] ?? '';
              const to = trip.route[trip.route.length - 1] ?? '';
              const viaCount = Math.max(trip.route.length - 2, 0);
              const isRequest = trip.kind === 'request';
              return (
                <li key={trip.id}>
                  <Link
                    href={`/trip/${trip.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-oat-light/40"
                  >
                    <span
                      className={`inline-flex size-2 shrink-0 rounded-full ${
                        isRequest ? 'bg-slushie-500' : 'bg-lemon-500'
                      }`}
                      aria-hidden
                    />
                    <span className="font-mono text-sm font-semibold">
                      {from} <ArrowRight className="inline size-3 text-muted-foreground" /> {to}
                    </span>
                    {viaCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        via {viaCount} stop{viaCount > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      {format(parseISO(trip.travel_date), 'd LLL')}
                    </span>
                    {trip.airline && (
                      <span className="text-xs text-muted-foreground">{trip.airline}</span>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          isRequest
                            ? 'bg-slushie-500/20 text-slushie-800'
                            : 'bg-lemon-400 text-warm-charcoal'
                        }`}
                      >
                        {isRequest ? 'Request' : 'Offer'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDistanceToNow(parseISO(trip.created_at), { addSuffix: true })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Results — two columns when the composer has valid input
// ─────────────────────────────────────────────────────────────────────

function parseFlightNumbers(fn: string): string[] {
  return fn
    .split(',')
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean);
}

async function Results({
  from,
  to,
  date,
  flightNumbers,
  userId,
}: {
  from: string;
  to: string;
  date: string;
  flightNumbers: string[];
  userId: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const viewer: ViewerProfile = await fetchViewerProfile(supabase, userId);
  const { data: trips, error } = await fetchTripsForSearch(supabase, {
    from,
    to,
    date,
    flightNumbers,
    dateWindowDays: DEFAULT_DATE_WINDOW_DAYS,
  });

  if (error) {
    return (
      <div className="container py-10">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load trips: {error.message}
        </div>
      </div>
    );
  }

  const enriched = await enrichTripsWithProfiles(supabase, trips ?? []);
  const ranked = rankTrips(enriched, {
    origin: from,
    destination: to,
    date,
    dateWindowDays: DEFAULT_DATE_WINDOW_DAYS,
    ...(flightNumbers.length > 0 ? { flightNumbers } : {}),
    viewerLanguages: viewer.languages,
    viewerPrimaryLanguage: viewer.primaryLanguage,
  });

  const requests = ranked.filter((r) => (r.trip as (typeof enriched)[number]).kind === 'request');
  const offers = ranked.filter((r) => (r.trip as (typeof enriched)[number]).kind === 'offer');

  return (
    <section className="container max-w-5xl py-8">
      {/* Slim results summary — the compact hero already shows the route + date,
          so this line only carries the ±window caveat, flight-number pills, and
          totals. Cuts vertical chrome above the two-column grid. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {flightNumbers.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 font-mono font-semibold text-foreground">
            <Plane className="size-3" /> {flightNumbers.join(' · ')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            ±1 day window
          </span>
        )}
        <Separator orientation="vertical" className="h-3" />
        <span>
          <b className="text-foreground">{ranked.length}</b> total · {requests.length} request
          {requests.length === 1 ? '' : 's'} · {offers.length} offer
          {offers.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Column
          label="Families looking for a companion"
          accent="slushie"
          emptyTitle="No open requests here yet"
          emptyBody="Be the first to post on this route — families are always looking."
          cta="Post a request"
          ctaHref={`/dashboard/new/request?from=${from}&to=${to}&date=${date}`}
          items={requests}
          viewerLanguages={viewer.languages}
        />
        <Column
          label="Travellers offering to help"
          accent="lemon"
          emptyTitle="No companions posted yet"
          emptyBody="If you're flying this route, post an offer — it's the single most useful thing you can do."
          cta="Offer to help"
          ctaHref={`/dashboard/new/offer?from=${from}&to=${to}&date=${date}`}
          items={offers}
          viewerLanguages={viewer.languages}
        />
      </div>

      {ranked.length < 3 && (
        <div className="mt-10 rounded-2xl border border-dashed border-oat bg-oat-light/30 p-5 text-sm text-warm-charcoal">
          <p className="font-serif text-lg">Thin matches on this route.</p>
          <p className="mt-1 text-muted-foreground">
            Try a wider date window or post your own — the match usually appears within a few days
            once it&rsquo;s live.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="slushie" size="sm">
              <Link href={`/dashboard/new/request?from=${from}&to=${to}&date=${date}`}>
                Post a request
              </Link>
            </Button>
            <Button asChild variant="lemon" size="sm">
              <Link href={`/dashboard/new/offer?from=${from}&to=${to}&date=${date}`}>
                Offer to help
              </Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Column<T extends RankableTrip & { card: TripCardData }>({
  label,
  accent,
  emptyTitle,
  emptyBody,
  cta,
  ctaHref,
  items,
  viewerLanguages,
}: {
  label: string;
  accent: 'slushie' | 'lemon';
  emptyTitle: string;
  emptyBody: string;
  cta: string;
  ctaHref: string;
  items: Scored<T>[];
  viewerLanguages: string[];
}) {
  const accentDot = accent === 'slushie' ? 'bg-slushie-500' : 'bg-lemon-500';
  return (
    <section>
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${accentDot}`} aria-hidden />
        <h2 className="font-serif text-xl">{label}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length} match{items.length === 1 ? '' : 'es'}
      </p>
      <div className="mt-4 space-y-4">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyBody} cta={cta} href={ctaHref} />
        ) : (
          items.map((s) => (
            <TripCard
              key={s.trip.id}
              data={s.trip.card}
              viewerLanguages={viewerLanguages}
              scored={s}
            />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Illustrative "around today" roster. Replaced by a live feed once the
 * DiscoveryPanels section has real volume — kept as a warm-vibes fallback
 * that works even when the database is cold.
 */
const AROUND_TODAY: Array<{
  name: string;
  language: string;
  location: string;
  dot: string;
}> = [
  { name: 'Arjun', language: 'Bengali', location: 'Delft', dot: 'bg-matcha-600' },
  { name: 'Meera', language: 'Tamil', location: 'Berlin', dot: 'bg-ube-800' },
  { name: 'Yusuf', language: 'Urdu', location: 'Amsterdam', dot: 'bg-lemon-700' },
  { name: 'Priya', language: 'Bengali', location: 'for Ma · Dec 14', dot: 'bg-pomegranate-400' },
  { name: 'Ravi', language: 'Telugu', location: 'Singapore', dot: 'bg-slushie-500' },
  { name: 'Farah', language: 'Arabic', location: 'Dubai', dot: 'bg-matcha-600' },
  { name: 'Asha', language: 'Gujarati', location: 'Nairobi', dot: 'bg-lemon-700' },
  { name: 'Lin', language: 'Mandarin', location: 'Bangkok', dot: 'bg-ube-800' },
];
