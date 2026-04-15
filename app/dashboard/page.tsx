import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { format, parseISO } from 'date-fns';
import { Inbox, Pencil, Plus, Send, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { RouteLine } from '@/components/route-line';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RespondButtons } from './respond-buttons';

export const metadata: Metadata = { title: 'Dashboard' };

// My trips / incoming requests / outgoing requests / active matches.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { userId } = await auth();
  if (!userId) redirect('/auth/sign-in?next=/dashboard');
  const uid = userId;

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
         requester:public_profiles!match_requests_requester_id_fkey(id, display_name, photo_url, primary_language, verified_channel_count)`,
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

  return (
    <div className="container max-w-5xl py-10">
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
            <Inbox className="mr-1 size-4" /> Incoming ({incoming.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="trips">My trips ({myTrips.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="mr-1 size-4" /> Sent ({outgoing.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="matches">
            <Users className="mr-1 size-4" /> Matches ({matches.data?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Incoming */}
        <TabsContent value="incoming" className="mt-6 space-y-4">
          {(incoming.data ?? []).length === 0 ? (
            <EmptyState
              title="No incoming requests yet"
              description="When someone sends a request for one of your trips, it appears here."
            />
          ) : (
            (incoming.data ?? []).map((r) => {
              const trip = (
                r as unknown as {
                  trip: {
                    id: string;
                    route: string[];
                    travel_date: string;
                    kind: 'request' | 'offer';
                  };
                }
              ).trip;
              const req = (
                r as unknown as {
                  requester: {
                    id: string;
                    display_name: string | null;
                    photo_url: string | null;
                    primary_language: string;
                    verified_channel_count: number;
                  };
                }
              ).requester;
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          <Link
                            href={`/profile/${req?.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {req?.display_name ?? 'Someone'}
                          </Link>{' '}
                          wants to travel with you
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')} ·{' '}
                          {trip.route.join(' → ')} ·{' '}
                          <Badge variant="muted" className="align-middle font-normal">
                            {req?.verified_channel_count ?? 0} verified
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <blockquote className="rounded-md border bg-muted/40 p-3 text-sm italic">
                      {r.intro_message}
                    </blockquote>
                    <RespondButtons matchRequestId={r.id} />
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* My trips */}
        <TabsContent value="trips" className="mt-6 space-y-4">
          {(myTrips.data ?? []).length === 0 ? (
            <EmptyState
              title="No trips posted yet"
              description="Post a request if you're a family member, or an offer if you're flying a route."
              cta="Post a trip"
              href="/post/request"
              icon={Plus}
            />
          ) : (
            (myTrips.data ?? []).map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={t.kind === 'request' ? 'secondary' : 'default'}>
                        {t.kind === 'request' ? 'Request' : 'Offer'}
                      </Badge>
                      <StatusPill status={t.status} />
                    </div>
                    <RouteLine route={t.route} />
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(t.travel_date), 'EEE, d LLL yyyy')}
                      {t.airline ? ` · ${t.airline}` : ''}
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/trip/${t.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Sent */}
        <TabsContent value="sent" className="mt-6 space-y-4">
          {(outgoing.data ?? []).length === 0 ? (
            <EmptyState
              title="You haven't sent any requests yet"
              description="Browse open trips and send a request when you find a good match."
              cta="Browse trips"
              href="/search"
            />
          ) : (
            (outgoing.data ?? []).map((r) => {
              const trip = (
                r as unknown as {
                  trip: {
                    id: string;
                    route: string[];
                    travel_date: string;
                    poster: { id: string; display_name: string | null } | null;
                  };
                }
              ).trip;
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-2 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        <Link
                          href={`/trip/${trip.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {trip.poster?.display_name ?? 'Trip'}
                        </Link>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    <RouteLine route={trip.route} />
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Matches */}
        <TabsContent value="matches" className="mt-6 space-y-4">
          {(matches.data ?? []).length === 0 ? (
            <EmptyState
              title="No active matches"
              description="When a request is accepted, your match thread appears here."
            />
          ) : (
            (matches.data ?? []).map((m) => {
              const trip = (m as unknown as { trip: { route: string[]; travel_date: string } })
                .trip;
              return (
                <Card key={m.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusPill status={m.status} />
                      </div>
                      <RouteLine route={trip.route} />
                      <div className="text-xs text-muted-foreground">
                        {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/match/${m.id}`}>Open thread</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; variant: 'muted' | 'success' | 'destructive' | 'secondary' }
  > = {
    open: { label: 'Open', variant: 'muted' },
    matched: { label: 'Matched', variant: 'success' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'muted' },
    pending: { label: 'Pending', variant: 'muted' },
    accepted: { label: 'Accepted', variant: 'success' },
    declined: { label: 'Declined', variant: 'muted' },
    auto_declined: { label: 'Auto-declined', variant: 'muted' },
    active: { label: 'Active', variant: 'success' },
    disputed: { label: 'Disputed', variant: 'destructive' },
  };
  const entry = map[status] ?? { label: status, variant: 'muted' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
