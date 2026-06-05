import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, Calendar, Plane } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RouteLine } from '@/components/route-line';
import {
  CompanionCard,
  type CompanionCardData,
  type ExistingRequestState,
} from '@/components/matches/companion-card';
import type { FamilyTripSummary } from '@/components/matches/intro-modal';
import { and, eq, inArray, or } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import {
  matchRequests,
  matches as matchesTbl,
  profileReviewStats,
  publicProfiles,
  trips as tripsTbl,
} from '@/lib/db/schema';
import {
  DEFAULT_DATE_WINDOW_DAYS,
  enrichTripsWithProfiles,
  fetchTripsForSearch,
  fetchViewerProfile,
} from '@/lib/search';
import { rankTrips, type SearchCriteria } from '@/lib/matching';

export const metadata: Metadata = { title: 'Companions on your flight' };

export const dynamic = 'force-dynamic';

/**
 * Family-side shortlist for a posted request trip. Shows up to 5 of
 * the strongest companion matches, each as a rich card with an
 * evidence badge explaining *why* they're here.
 *
 * Scope per docs/UX_MATCHMAKING.md: family-side only. Offer trips
 * redirect back to /trip/:id — the discovery surface for offers is
 * the home-page search feed, not this page.
 *
 * Data flow:
 *   1. Load owner's request trip (auth + ownership check).
 *   2. fetchTripsForSearch — leg-based candidate lookup (0016).
 *   3. Filter to opposite-kind, not-self, status=open.
 *   4. Enrich with poster profiles, rank with the matcher, dedupe
 *      per user_id (one companion might post several matching
 *      offers — show their best).
 *   5. Sidecar fetches for bio / verifications / review stats /
 *      existing match_request state.
 *   6. Top 5 render as cards; anything beyond renders as an
 *      "— N more available —" expander (client-controlled, see
 *      CompanionCard).
 */

interface MatchesPageProps {
  params: Promise<{ id: string }>;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { id } = await params;
  const userId = await requireUserId(`/trip/${id}/matches`);

  // ── 1. Load the trip, verify ownership ──────────────────────────────
  const trip = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: tripsTbl.id,
        user_id: tripsTbl.userId,
        kind: tripsTbl.kind,
        route: tripsTbl.route,
        travel_date: tripsTbl.travelDate,
        flight_numbers: tripsTbl.flightNumbers,
        help_categories: tripsTbl.helpCategories,
        status: tripsTbl.status,
      })
      .from(tripsTbl)
      .where(eq(tripsTbl.id, id))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!trip) notFound();
  if (trip.user_id !== userId) redirect(`/trip/${id}`);

  // Family-side surface only; an offer trip's discovery is the home-page
  // search feed.
  if (trip.kind !== 'request') redirect(`/trip/${id}`);

  const origin = trip.route[0] as string;
  const destination = trip.route[trip.route.length - 1] as string;
  const flightNumbers: string[] = (trip.flight_numbers ?? []).filter(
    (x: string | null): x is string => typeof x === 'string' && x.length > 0,
  );

  // Non-open trips: the match flow is past tense; point the owner at
  // /trip/:id where the status is already shown.
  if (trip.status !== 'open') {
    return (
      <PageShell trip={trip}>
        <Alert>
          <AlertTitle>This trip is no longer open.</AlertTitle>
          <AlertDescription>
            Status: <b>{trip.status}</b>. Matches only surface while the trip is open.
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  // ── 2-3. Candidate lookup, enrichment, viewer profile — all in one tx
  const { enriched, viewer } = await withUser(userId, async (tx) => {
    const candidates = await fetchTripsForSearch(tx, {
      from: origin,
      to: destination,
      date: trip.travel_date,
      flightNumbers,
      dateWindowDays: DEFAULT_DATE_WINDOW_DAYS,
    });
    const opposing = candidates.filter(
      (t) => t.kind === 'offer' && t.user_id !== userId && t.status === 'open',
    );
    const enriched = await enrichTripsWithProfiles(tx, opposing);
    const viewer = await fetchViewerProfile(tx, userId);
    return { enriched, viewer };
  });
  const criteria: SearchCriteria = {
    origin,
    destination,
    date: trip.travel_date,
    dateWindowDays: DEFAULT_DATE_WINDOW_DAYS,
    flightNumbers,
    viewerLanguages: viewer.languages,
    viewerPrimaryLanguage: viewer.primaryLanguage,
  };
  const ranked = rankTrips(enriched, criteria);

  // Dedupe by companion — one user may have multiple matching offers.
  // Keep only their highest-scored candidate trip.
  const bestByUser = new Map<string, (typeof ranked)[number]>();
  for (const scored of ranked) {
    const prev = bestByUser.get(scored.trip.user_id);
    if (!prev || scored.score > prev.score) bestByUser.set(scored.trip.user_id, scored);
  }
  const uniqueCandidates = Array.from(bestByUser.values()).sort((a, b) => b.score - a.score);

  if (uniqueCandidates.length === 0) {
    return (
      <PageShell trip={trip}>
        <EmptyState />
      </PageShell>
    );
  }

  // ── 4. Sidecar data for the cards (bio, reviews, requests, matches) ─
  // Sequential inside one user tx. Note: `verifications` was dropped in
  // 0009 — verifiedChannels is always empty now. The card UI handles
  // empty arrays gracefully.
  const companionUserIds = uniqueCandidates.map((c) => c.trip.user_id);
  const companionTripIds = uniqueCandidates.map((c) => c.trip.id);

  const sidecar = await withUser(userId, async (tx) => {
    const profilesData = await tx
      .select({ id: publicProfiles.id, bio: publicProfiles.bio })
      .from(publicProfiles)
      .where(inArray(publicProfiles.id, companionUserIds));
    const reviewsData = await tx
      .select({
        user_id: profileReviewStats.userId,
        review_count: profileReviewStats.reviewCount,
        average_rating: profileReviewStats.averageRating,
      })
      .from(profileReviewStats)
      .where(inArray(profileReviewStats.userId, companionUserIds));
    const sentData = await tx
      .select({ trip_id: matchRequests.tripId, status: matchRequests.status })
      .from(matchRequests)
      .where(
        and(eq(matchRequests.requesterId, userId), inArray(matchRequests.tripId, companionTripIds)),
      );
    // Pull any accepted match row so the status pill can deep-link.
    const matchesData = await tx
      .select({ id: matchesTbl.id, trip_id: matchesTbl.tripId })
      .from(matchesTbl)
      .where(
        and(
          inArray(matchesTbl.tripId, companionTripIds),
          or(eq(matchesTbl.posterId, userId), eq(matchesTbl.requesterId, userId)),
        ),
      );
    return { profilesData, reviewsData, sentData, matchesData };
  });

  const bioByUser = new Map<string, string | null>();
  for (const p of sidecar.profilesData) if (p.id) bioByUser.set(p.id, p.bio);

  // verifiedChannels: always empty (verifications dropped in 0009).
  const channelsByUser = new Map<string, string[]>();

  const reviewStatsByUser = new Map<
    string,
    { review_count: number; average_rating: number | null }
  >();
  for (const r of sidecar.reviewsData) {
    if (!r.user_id) continue;
    reviewStatsByUser.set(r.user_id, {
      review_count: r.review_count ?? 0,
      average_rating: r.average_rating != null ? Number(r.average_rating) : null,
    });
  }

  const sentByTrip = new Map<string, ExistingRequestState['status']>();
  for (const s of sidecar.sentData) {
    sentByTrip.set(s.trip_id, s.status as ExistingRequestState['status']);
  }

  const matchIdByTrip = new Map<string, string>();
  for (const m of sidecar.matchesData) matchIdByTrip.set(m.trip_id, m.id);

  // ── 5. Build family-trip summary for the intro modal template ──────
  const familyTripSummary: FamilyTripSummary = {
    routeLabel: (trip.route as string[]).join(' → '),
    travelDate: trip.travel_date,
    flightNumbers,
    helpCategories: (trip.help_categories ?? []) as string[],
  };

  // ── 6. Project to card data + render ────────────────────────────────
  const shortlist = uniqueCandidates.slice(0, 5);
  const overflow = uniqueCandidates.length - shortlist.length;

  return (
    <PageShell trip={trip}>
      <p className="text-sm text-muted-foreground">
        We found {uniqueCandidates.length} companion
        {uniqueCandidates.length === 1 ? '' : 's'} on your flight
        {uniqueCandidates.length > 5 ? ' — showing the top 5' : ''}.
      </p>

      <div className="space-y-4">
        {shortlist.map((scored) => {
          const uid = scored.trip.user_id;
          const tid = scored.trip.id;
          const reviewStats = reviewStatsByUser.get(uid) ?? null;
          const sentStatus = sentByTrip.get(tid);

          const companion: CompanionCardData = {
            tripId: tid,
            userId: uid,
            displayName: scored.trip.card.display_name ?? 'Anonymous',
            photoUrl: scored.trip.card.photo_url ?? null,
            languages: scored.trip.card.languages,
            primaryLanguage: scored.trip.card.primary_language ?? null,
            bio: bioByUser.get(uid) ?? null,
            verifiedChannels: channelsByUser.get(uid) ?? [],
            reviewCount: reviewStats?.review_count ?? 0,
            averageRating: reviewStats?.average_rating ?? null,
          };

          const existingRequest: ExistingRequestState | null = sentStatus
            ? {
                status: sentStatus,
                matchId: matchIdByTrip.get(tid) ?? null,
              }
            : null;

          return (
            <CompanionCard
              key={uid}
              companion={companion}
              scored={scored}
              origin={origin}
              destination={destination}
              travelDate={trip.travel_date}
              familyTrip={familyTripSummary}
              existingRequest={existingRequest}
            />
          );
        })}

        {overflow > 0 ? (
          <p className="rounded-2xl border border-dashed border-oat bg-cream/40 p-4 text-center text-sm text-muted-foreground">
            — {overflow} more available. Shortlist capped at 5 so you can focus. Accept or pass on
            these first.
          </p>
        ) : null}
      </div>
    </PageShell>
  );
}

// ── Page shell: trip summary header + back link ───────────────────────

function PageShell({
  trip,
  children,
}: {
  trip: {
    id: string;
    route: string[];
    travel_date: string;
    flight_numbers: string[] | null;
  };
  children: React.ReactNode;
}) {
  return (
    <div className="container max-w-3xl py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/trip/${trip.id}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back to trip
          </Link>
        </Button>
      </div>

      <header className="mt-3">
        <p className="clay-label">Companions on your flight</p>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">Who can help on this trip</h1>
      </header>

      <Card className="mt-6">
        <CardContent className="space-y-3 p-5">
          <RouteLine route={trip.route} />
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" aria-hidden />
              {formatLongDate(trip.travel_date)}
            </span>
            {trip.flight_numbers && trip.flight_numbers.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Plane className="size-4" aria-hidden />
                {trip.flight_numbers.join(' + ')}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-oat bg-gradient-to-b from-cream to-oat-light/30 p-10 text-center">
      <div className="mb-3 text-4xl" aria-hidden>
        ✈️
      </div>
      <h2 className="font-serif text-xl">No companions on your flight yet.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        We&rsquo;ll email you the moment someone posts a matching trip. In the meantime:
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/">Browse all open trips</Link>
        </Button>
      </div>
    </div>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
