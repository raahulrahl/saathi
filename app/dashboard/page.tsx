import Link from 'next/link';
import type { Metadata } from 'next';
import { Inbox, Pencil, Plus, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import {
  IncomingRequestCard,
  type IncomingRequest,
} from '@/components/dashboard/incoming-request-card';
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
 * Dashboard home: four tabs over the signed-in user's trip data
 *   - Incoming: pending match_requests for trips they posted
 *   - My trips: trips they posted (any status)
 *   - Sent: match_requests they sent to other people's trips
 *   - Matches: accepted pairings
 *
 * All card rendering is delegated to components under
 * `components/dashboard/*` so this file can stay at the top of the
 * routing + data-fetching stack and not grow into a 300-line god-file.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createSupabaseServerClient();
  const uid = await requireUserId('/dashboard');
  const { welcome } = await searchParams;
  // Show the "profile saved" banner on first dashboard arrival from the
  // onboarding redirect. Drops out after the user navigates anywhere else.
  const showWelcomeBanner = welcome === '1';

  const [myTrips, incoming, outgoing, matches] = await Promise.all([
    supabase
      .from('trips')
      .select('id, kind, route, travel_date, status, airline')
      .eq('user_id', uid)
      .order('travel_date', { ascending: true }),
    supabase
      .from('match_requests')
      .select(
        `id, status, intro_message, created_at, requester_id,
         trip:trips!inner(id, kind, route, travel_date, user_id),
         requester:public_profiles!match_requests_requester_id_fkey(id, display_name, photo_url, primary_language)`,
      )
      .eq('trip.user_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
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

  // Supabase's select() returns its best-effort inferred type which
  // doesn't always match the joined shape. We know the shape from the
  // select() strings above; the unknown-cast is the idiomatic escape
  // hatch until we regenerate types from the schema.
  const incomingRows = (incoming.data ?? []) as unknown as IncomingRequest[];
  const myTripRows = (myTrips.data ?? []) as unknown as MyTrip[];
  const outgoingRows = (outgoing.data ?? []) as unknown as SentRequest[];
  const matchRows = (matches.data ?? []) as unknown as DashboardMatch[];

  return (
    <div className="container max-w-5xl py-10">
      {showWelcomeBanner ? <WelcomeBanner /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/onboarding">
              <Pencil className="mr-1 size-3.5" /> Edit profile
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/post/offer">
              <Plus className="mr-1 size-4" /> New offer
            </Link>
          </Button>
          <Button asChild>
            <Link href="/post/request">
              <Plus className="mr-1 size-4" /> New request
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="incoming" className="mt-8">
        <TabsList>
          <TabsTrigger value="incoming">
            <Inbox className="mr-1 size-4" /> Incoming ({incomingRows.length})
          </TabsTrigger>
          <TabsTrigger value="trips">My trips ({myTripRows.length})</TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="mr-1 size-4" /> Sent ({outgoingRows.length})
          </TabsTrigger>
          <TabsTrigger value="matches">
            <Users className="mr-1 size-4" /> Matches ({matchRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6 space-y-4">
          {incomingRows.length === 0 ? (
            <EmptyState
              title="No incoming requests yet"
              description="When someone sends a request for one of your trips, it appears here."
            />
          ) : (
            incomingRows.map((r) => <IncomingRequestCard key={r.id} request={r} />)
          )}
        </TabsContent>

        <TabsContent value="trips" className="mt-6 space-y-4">
          {myTripRows.length === 0 ? (
            <EmptyState
              title="No trips posted yet"
              description="Post a request if you're a family member, or an offer if you're flying a route."
              cta="Post a trip"
              href="/post/request"
              icon={Plus}
            />
          ) : (
            myTripRows.map((t) => <MyTripCard key={t.id} trip={t} />)
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-6 space-y-4">
          {outgoingRows.length === 0 ? (
            <EmptyState
              title="You haven't sent any requests yet"
              description="Browse open trips and send a request when you find a good match."
              cta="Browse trips"
              href="/search"
            />
          ) : (
            outgoingRows.map((r) => <SentRequestCard key={r.id} request={r} />)
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-6 space-y-4">
          {matchRows.length === 0 ? (
            <EmptyState
              title="No active matches"
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

/**
 * Matcha-tinted banner shown once at the top of the dashboard after a
 * successful onboarding save. Not a component that needs reuse — kept
 * inline since it's tied specifically to this page's welcome flow.
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
          Post a request if you&rsquo;re sending a parent, or an offer if you&rsquo;re flying a
          route and open to helping. You can edit your profile from the button up here.
        </p>
      </div>
    </div>
  );
}
