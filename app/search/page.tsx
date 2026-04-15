import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Calendar, Compass } from 'lucide-react';
import { FlightComposer } from '@/components/flight-composer';
import { TripCard, type TripCardData } from '@/components/trip-card';
import { EmptyState } from '@/components/empty-state';
import { Separator } from '@/components/ui/separator';
import { getUserId } from '@/lib/auth-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rankTrips, type RankableTrip, type Scored } from '@/lib/matching';
import { isValidIata, formatAirport } from '@/lib/iata';
import {
  DEFAULT_DATE_WINDOW_DAYS,
  enrichTripsWithProfiles,
  fetchTripsForSearch,
  fetchViewerProfile,
  type ViewerProfile,
} from '@/lib/search';

export const metadata: Metadata = {
  title: 'Browse trips',
  description: 'Find people already flying your route.',
};

// Always fresh — search is timely by nature and ranking depends on the request.
export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string; fn?: string }>;
}

/**
 * The route page itself. Parses the URL params, renders the chrome
 * (heading, composer, empty state), and hands off the async work to the
 * <Results /> component under a Suspense boundary so the non-DB parts
 * of the page show immediately.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { from = '', to = '', date = '', fn = '' } = await searchParams;
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  const flightNumbers = parseFlightNumbers(fn);
  const validInput = isValidIata(f) && isValidIata(t) && !!date;

  // Fetch the viewer's profile once here — used by the composer for
  // role-aware submit targets AND by Results for language highlighting.
  // Consolidating the fetch avoids two round-trips for the same row.
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId();
  const viewer = await fetchViewerProfile(supabase, userId);

  return (
    <div className="container py-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Who&apos;s on this flight?
        </h1>
        <p className="text-sm text-warm-charcoal">
          {flightNumbers.length > 0
            ? 'Exact flight-number matches — everyone here is on at least one leg you named.'
            : '±1 day around your date. Add a flight number to tighten to the same aircraft.'}
        </p>
      </div>

      <FlightComposer
        className="mt-6"
        variant="compact"
        defaultMode="seek"
        viewerRole={viewer.role}
        {...(f && t ? { defaultRoute: [f, t] } : {})}
        {...(date ? { defaultDate: date } : {})}
        {...(flightNumbers.length > 0 ? { defaultFlightNumbers: flightNumbers } : {})}
      />

      {!validInput ? (
        <EmptyState
          className="mt-10"
          icon={Compass}
          title="Search to see who's flying"
          description="Enter an origin, destination, and date above."
        />
      ) : (
        <Suspense fallback={<div className="mt-10 text-sm text-muted-foreground">Loading…</div>}>
          <Results from={f} to={t} date={date} flightNumbers={flightNumbers} viewer={viewer} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Parse the `?fn=QR540,QR23` URL param into an uppercased, whitespace-
 * stripped array. Anything non-truthy (empty param, bare commas) drops
 * out. Matches the normalisation the FlightComposer does on typed input.
 */
function parseFlightNumbers(fn: string): string[] {
  return fn
    .split(',')
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean);
}

/**
 * Async data section. Runs inside a Suspense boundary so the page chrome
 * renders while this is waiting on the DB. Fetches trips, attaches poster
 * profile data, ranks, and splits into two columns.
 */
async function Results({
  from,
  to,
  date,
  flightNumbers,
  viewer,
}: {
  from: string;
  to: string;
  date: string;
  flightNumbers: string[];
  viewer: ViewerProfile;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: trips, error } = await fetchTripsForSearch(supabase, {
    from,
    to,
    date,
    flightNumbers,
    dateWindowDays: DEFAULT_DATE_WINDOW_DAYS,
  });

  if (error) {
    return (
      <div className="mt-10 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Couldn&apos;t load trips: {error.message}
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
    <>
      <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {flightNumbers.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 font-mono font-semibold text-foreground">
            ✈ {flightNumbers.join(' · ')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" />
            ±1 day around {date}
          </span>
        )}
        <Separator orientation="vertical" className="h-4" />
        <span>
          {formatAirport(from)} → {formatAirport(to)}
        </span>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Column
          label="Families looking for a companion"
          emptyTitle="No open requests here yet"
          emptyBody="Be the first to post on this route — parents are always looking."
          cta="Post a request"
          ctaHref={`/post/request?from=${from}&to=${to}&date=${date}`}
          items={requests}
          viewerLanguages={viewer.languages}
        />
        <Column
          label="Travellers offering to help"
          emptyTitle="No companions posted yet"
          emptyBody="If you're flying this route, post an offer — it's the single most useful thing you can do."
          cta="Offer to help"
          ctaHref={`/post/offer?from=${from}&to=${to}&date=${date}`}
          items={offers}
          viewerLanguages={viewer.languages}
        />
      </div>
    </>
  );
}

/**
 * One of the two result columns on the search page. Pure rendering —
 * takes already-scored items and either renders cards or an empty state
 * with a CTA to post into this exact route/date.
 */
function Column<T extends RankableTrip & { card: TripCardData }>({
  label,
  emptyTitle,
  emptyBody,
  cta,
  ctaHref,
  items,
  viewerLanguages,
}: {
  label: string;
  emptyTitle: string;
  emptyBody: string;
  cta: string;
  ctaHref: string;
  items: Scored<T>[];
  viewerLanguages: string[];
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl">{label}</h2>
      <p className="text-sm text-muted-foreground">
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
