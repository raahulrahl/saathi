import Link from 'next/link';
import type { Metadata } from 'next';
import { Pencil, Plus, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { type IncomingRequest } from '@/components/dashboard/incoming-request-card';
import { MyTripCard, type MyTrip } from '@/components/dashboard/my-trip-card';
import { SentRequestCard, type SentRequest } from '@/components/dashboard/sent-request-card';
import { MatchCard, type DashboardMatch } from '@/components/dashboard/match-card';
import { requireUserId } from '@/lib/auth-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

// Always fresh — the dashboard shows per-user data, no caching.
export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: Promise<{ welcome?: string }>;
}

/**
 * Dashboard home: three tabs — My trips (default), Sent, Matches.
 *
 * Incoming requests used to live in their own tab but that meant
 * returning users landed on an empty orphan list. Now each incoming
 * request is rendered INLINE on its parent trip card in "My trips",
 * so the user sees "this flight has 2 people hoping to join" without
 * needing to switch context.
 *
 * The top of the page carries a warm greeting and a one-line stats
 * strip so the user gets the full picture at a glance before any
 * tab selection.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createSupabaseServerClient();
  const uid = await requireUserId('/dashboard');
  const { welcome } = await searchParams;
  const showWelcomeBanner = welcome === '1';

  // First fetch: the user's profile + their trips. We need the trip IDs
  // before we can query match_requests targeting them. A filter like
  // .eq('trip.user_id', uid) on a joined alias is supposed to work in
  // PostgREST, but has produced silently-empty results in practice — so
  // we switch to an explicit .in('trip_id', tripIds) filter instead.
  const [profileRes, myTrips, outgoing, matches] = await Promise.all([
    supabase.from('public_profiles').select('display_name').eq('id', uid).maybeSingle(),
    supabase
      .from('trips')
      .select('id, kind, route, travel_date, status, airline')
      .eq('user_id', uid)
      .order('travel_date', { ascending: true }),
    supabase
      .from('match_requests')
      .select(
        `id, status, intro_message, created_at,
         trip:trips!inner(id, kind, route, travel_date, user_id,
           poster:profiles!trips_user_id_fkey(id, display_name, photo_url))`,
      )
      .eq('requester_id', uid)
      .order('created_at', { ascending: false }),
    supabase
      .from('matches')
      .select(
        `id, status, created_at, trip_id, poster_id, requester_id,
         trip:trips!inner(route, travel_date, kind)`,
      )
      .or(`poster_id.eq.${uid},requester_id.eq.${uid}`)
      .order('created_at', { ascending: false }),
  ]);

  const myTripRows = (myTrips.data ?? []) as unknown as MyTrip[];
  const myTripIds = myTripRows.map((t) => t.id);

  // Second fetch: pending requests targeting ANY of my trips. Embeds the
  // requester profile via the base `profiles` table (not the view) so the
  // FK detection works reliably.
  const incomingRaw =
    myTripIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('match_requests')
          .select(
            `id, status, intro_message, created_at, requester_id, trip_id,
             requester:profiles!match_requests_requester_id_fkey(id, display_name, photo_url)`,
          )
          .in('trip_id', myTripIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

  // Surface any Supabase errors to the server log — silent empty results
  // cost hours of debugging.
  for (const [name, res] of [
    ['myTrips', myTrips],
    ['incomingRaw', incomingRaw],
    ['outgoing', outgoing],
    ['matches', matches],
  ] as const) {
    if (res.error) console.error(`[dashboard] ${name} query failed:`, res.error);
  }

  // Shape raw match_requests into IncomingRequest[] — hydrate `trip` from
  // the already-fetched myTripRows rather than re-embedding.
  const tripById = new Map(myTripRows.map((t) => [t.id, t]));
  // PostgREST's inferred TS type for a to-one embed returns an array,
  // but the runtime value is a single object. Cast through unknown so TS
  // doesn't complain about the shape mismatch.
  const incomingRows: IncomingRequest[] = (
    (incomingRaw.data ?? []) as unknown as Array<{
      id: string;
      trip_id: string;
      intro_message: string | null;
      requester: {
        id: string;
        display_name: string | null;
        photo_url: string | null;
      } | null;
    }>
  ).flatMap((r) => {
    const trip = tripById.get(r.trip_id);
    if (!trip) return [];
    return [
      {
        id: r.id,
        intro_message: r.intro_message,
        trip: {
          id: trip.id,
          route: trip.route,
          travel_date: trip.travel_date,
          kind: trip.kind,
        },
        requester: {
          id: r.requester?.id ?? '',
          display_name: r.requester?.display_name ?? null,
          photo_url: r.requester?.photo_url ?? null,
        },
      },
    ];
  });

  console.log(`[dashboard] ${uid} — trips:${myTripRows.length} incoming:${incomingRows.length}`);

  const outgoingRows = (outgoing.data ?? []) as unknown as SentRequest[];
  const matchRows = (matches.data ?? []) as unknown as DashboardMatch[];

  // Group incoming requests by trip_id so MyTripCard can render them inline.
  const incomingByTripId = new Map<string, IncomingRequest[]>();
  for (const r of incomingRows) {
    const list = incomingByTripId.get(r.trip.id) ?? [];
    list.push(r);
    incomingByTripId.set(r.trip.id, list);
  }

  const firstName = profileRes.data?.display_name?.split(' ')[0] ?? null;
  const hasAnyData = myTripRows.length > 0 || outgoingRows.length > 0 || matchRows.length > 0;

  return (
    <div className="container max-w-5xl py-10">
      {showWelcomeBanner ? <WelcomeBanner /> : null}

      {/* ── Header: warm greeting + action buttons ──────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="clay-label">Your dashboard</p>
          <h1 className="mt-1 font-serif text-3xl md:text-4xl">
            {firstName ? `Hello, ${firstName}.` : 'Hello.'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasAnyData
              ? 'Here’s what’s happening across your Saathi trips.'
              : 'Post your first trip — a family is waiting for someone like you.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/onboarding?edit=1">
              <Pencil className="mr-1 size-4" /> Edit profile
            </Link>
          </Button>
          <Button asChild variant="lemon">
            <Link href="/dashboard/new/offer">
              <Plus className="mr-1 size-4" /> New offer
            </Link>
          </Button>
          <Button asChild variant="slushie">
            <Link href="/dashboard/new/request">
              <Plus className="mr-1 size-4" /> New request
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Stats strip ────────────────────────────────────────────── */}
      {hasAnyData && (
        <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-oat bg-card p-4 sm:grid-cols-4">
          <StatItem
            label="Active trips"
            value={
              myTripRows.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length
            }
          />
          <StatItem label="Hoping to join" value={incomingRows.length} emphasis />
          <StatItem label="Requests sent" value={outgoingRows.length} />
          <StatItem label="Matches" value={matchRows.length} />
        </div>
      )}

      {/* ── Tabs — My trips is primary, default, contains incoming inline ── */}
      <Tabs defaultValue="trips" className="mt-8">
        <TabsList>
          <TabsTrigger value="trips">My trips ({myTripRows.length})</TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="mr-1 size-4" /> Sent ({outgoingRows.length})
          </TabsTrigger>
          <TabsTrigger value="matches">
            <Users className="mr-1 size-4" /> Matches ({matchRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trips" className="mt-6 space-y-4">
          {myTripRows.length === 0 ? (
            <FirstTripEmptyState />
          ) : (
            myTripRows.map((t) => (
              <MyTripCard key={t.id} trip={t} incoming={incomingByTripId.get(t.id) ?? []} />
            ))
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-6 space-y-4">
          {outgoingRows.length === 0 ? (
            <EmptyState
              title="You haven't sent any requests yet"
              description="Browse open trips and send a request when you find a good match."
              cta="Browse trips"
              href="/browse"
            />
          ) : (
            outgoingRows.map((r) => <SentRequestCard key={r.id} request={r} />)
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-6 space-y-4">
          {matchRows.length === 0 ? (
            <EmptyState
              title="No matches yet"
              description="When a request is accepted, your match thread appears here."
            />
          ) : (
            matchRows.map((m) => <MatchCard key={m.id} match={m} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Stats atom ──────────────────────────────────────────────────────

function StatItem({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-serif text-2xl ${
          emphasis && value > 0 ? 'text-marigold-700' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ── First-trip empty state ─────────────────────────────────────────

function FirstTripEmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-oat bg-gradient-to-b from-cream to-oat-light/30 p-10 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        🌼
      </div>
      <h2 className="font-serif text-xl">Your Saathi is ready.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Flying somewhere? Post an offer so a family can find you. Sending a loved one alone? Post a
        request so someone on their flight can keep them company.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild variant="lemon">
          <Link href="/dashboard/new/offer">
            <Plus className="mr-1 size-4" /> Offer to help
          </Link>
        </Button>
        <Button asChild variant="slushie">
          <Link href="/dashboard/new/request">
            <Plus className="mr-1 size-4" /> Post a request
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Matcha-tinted banner shown once at the top of the dashboard after a
 * successful onboarding save.
 */
function WelcomeBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-matcha-300/60 bg-matcha-300/20 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-matcha-600 text-background">
        ✓
      </div>
      <div className="space-y-1">
        <p className="font-display text-base font-semibold text-foreground">
          Profile saved — welcome to Saathi.
        </p>
        <p className="text-sm text-warm-charcoal">
          Post a request if you&rsquo;re sending a loved one, or an offer if you&rsquo;re flying a
          route and open to helping. You can edit your profile from the button up here.
        </p>
      </div>
    </div>
  );
}
