import Link from 'next/link';
import type { Metadata } from 'next';
import { Pencil, Plus, Send, Users } from 'lucide-react';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { type IncomingRequest } from '@/components/dashboard/incoming-request-card';
import { MyTripCard, type MyTrip } from '@/components/dashboard/my-trip-card';
import { SentRequestCard, type SentRequest } from '@/components/dashboard/sent-request-card';
import { MatchCard, type DashboardMatch } from '@/components/dashboard/match-card';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import {
  matchRequests,
  matches as matchesTbl,
  profiles,
  publicProfiles,
  trips as tripsTbl,
} from '@/lib/db/schema';

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
  const uid = await requireUserId('/dashboard');
  const { welcome } = await searchParams;
  const showWelcomeBanner = welcome === '1';

  // Single user-scoped tx for everything. The previous data layer used
  // foreign-key embed syntax (`trip:trips!inner(...)`) — here we do explicit
  // joins and shape the rows on the JS side. Equivalent SQL, more readable.
  const data = await withUser(uid, async (tx) => {
    const profileRows = await tx
      .select({ display_name: publicProfiles.displayName })
      .from(publicProfiles)
      .where(eq(publicProfiles.id, uid))
      .limit(1);

    const myTripRows = (await tx
      .select({
        id: tripsTbl.id,
        kind: tripsTbl.kind,
        route: tripsTbl.route,
        travel_date: tripsTbl.travelDate,
        status: tripsTbl.status,
        airline: tripsTbl.airline,
      })
      .from(tripsTbl)
      .where(eq(tripsTbl.userId, uid))
      .orderBy(asc(tripsTbl.travelDate))) as unknown as MyTrip[];

    // Outgoing match_requests: join trip + poster profile.
    const outgoing = await tx
      .select({
        id: matchRequests.id,
        status: matchRequests.status,
        intro_message: matchRequests.introMessage,
        created_at: matchRequests.createdAt,
        trip_id: tripsTbl.id,
        trip_kind: tripsTbl.kind,
        trip_route: tripsTbl.route,
        trip_travel_date: tripsTbl.travelDate,
        trip_user_id: tripsTbl.userId,
        poster_id: profiles.id,
        poster_display_name: profiles.displayName,
        poster_photo_url: profiles.photoUrl,
      })
      .from(matchRequests)
      .innerJoin(tripsTbl, eq(tripsTbl.id, matchRequests.tripId))
      .innerJoin(profiles, eq(profiles.id, tripsTbl.userId))
      .where(eq(matchRequests.requesterId, uid))
      .orderBy(desc(matchRequests.createdAt));

    // Confirmed matches the user is part of.
    const matchesRows = await tx
      .select({
        id: matchesTbl.id,
        status: matchesTbl.status,
        created_at: matchesTbl.createdAt,
        trip_id: matchesTbl.tripId,
        poster_id: matchesTbl.posterId,
        requester_id: matchesTbl.requesterId,
        trip_route: tripsTbl.route,
        trip_travel_date: tripsTbl.travelDate,
        trip_kind: tripsTbl.kind,
      })
      .from(matchesTbl)
      .innerJoin(tripsTbl, eq(tripsTbl.id, matchesTbl.tripId))
      .where(or(eq(matchesTbl.posterId, uid), eq(matchesTbl.requesterId, uid)))
      .orderBy(desc(matchesTbl.createdAt));

    // Incoming pending match_requests on the user's trips, joined with the
    // requester profile. Run only if myTripRows is non-empty so we don't
    // issue a where-id-in([]) (which would emit `in ()` and break).
    const myTripIds = myTripRows.map((t) => t.id);
    const incoming =
      myTripIds.length === 0
        ? []
        : await tx
            .select({
              id: matchRequests.id,
              status: matchRequests.status,
              intro_message: matchRequests.introMessage,
              created_at: matchRequests.createdAt,
              requester_id: matchRequests.requesterId,
              trip_id: matchRequests.tripId,
              req_id: profiles.id,
              req_display_name: profiles.displayName,
              req_photo_url: profiles.photoUrl,
            })
            .from(matchRequests)
            .innerJoin(profiles, eq(profiles.id, matchRequests.requesterId))
            .where(
              and(inArray(matchRequests.tripId, myTripIds), eq(matchRequests.status, 'pending')),
            )
            .orderBy(desc(matchRequests.createdAt));

    return { profileRows, myTripRows, outgoing, matchesRows, incoming };
  });

  // Shape outgoing into SentRequest[] (re-nest the embedded trip + poster).
  const outgoingRows: SentRequest[] = data.outgoing.map((r) => ({
    id: r.id,
    status: r.status,
    intro_message: r.intro_message,
    created_at: r.created_at,
    trip: {
      id: r.trip_id,
      kind: r.trip_kind,
      route: r.trip_route,
      travel_date: r.trip_travel_date,
      user_id: r.trip_user_id,
      poster: {
        id: r.poster_id,
        display_name: r.poster_display_name,
        photo_url: r.poster_photo_url,
      },
    },
  })) as unknown as SentRequest[];

  const matchRows: DashboardMatch[] = data.matchesRows.map((m) => ({
    id: m.id,
    status: m.status,
    created_at: m.created_at,
    trip_id: m.trip_id,
    poster_id: m.poster_id,
    requester_id: m.requester_id,
    trip: {
      route: m.trip_route,
      travel_date: m.trip_travel_date,
      kind: m.trip_kind,
    },
  })) as unknown as DashboardMatch[];

  // Shape raw match_requests into IncomingRequest[] — hydrate `trip` from
  // the already-fetched myTripRows rather than re-embedding.
  const tripById = new Map(data.myTripRows.map((t) => [t.id, t]));
  const incomingRows: IncomingRequest[] = data.incoming.flatMap((r) => {
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
          id: r.req_id,
          display_name: r.req_display_name,
          photo_url: r.req_photo_url,
        },
      },
    ];
  });

  console.log(
    `[dashboard] ${uid} — trips:${data.myTripRows.length} incoming:${incomingRows.length}`,
  );

  // Group incoming requests by trip_id so MyTripCard can render them inline.
  const incomingByTripId = new Map<string, IncomingRequest[]>();
  for (const r of incomingRows) {
    const list = incomingByTripId.get(r.trip.id) ?? [];
    list.push(r);
    incomingByTripId.set(r.trip.id, list);
  }

  const firstName = data.profileRows[0]?.display_name?.split(' ')[0] ?? null;
  const hasAnyData = data.myTripRows.length > 0 || outgoingRows.length > 0 || matchRows.length > 0;

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
              data.myTripRows.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
                .length
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
          <TabsTrigger value="trips">My trips ({data.myTripRows.length})</TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="mr-1 size-4" /> Sent ({outgoingRows.length})
          </TabsTrigger>
          <TabsTrigger value="matches">
            <Users className="mr-1 size-4" /> Matches ({matchRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trips" className="mt-6 space-y-4">
          {data.myTripRows.length === 0 ? (
            <FirstTripEmptyState />
          ) : (
            data.myTripRows.map((t) => (
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
