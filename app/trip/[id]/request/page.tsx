import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq } from 'drizzle-orm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import { matchRequests, publicProfiles, publicTrips } from '@/lib/db/schema';
import { RequestForm } from './request-form';

export const metadata: Metadata = { title: 'Send a request' };

export default async function SendRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/trip/${id}/request`);

  const data = await withUser(userId, async (tx) => {
    const tripRows = await tx.select().from(publicTrips).where(eq(publicTrips.id, id)).limit(1);
    const trip = tripRows[0] ?? null;
    if (!trip) return { trip: null, existing: null, poster: null };
    const existingRows = await tx
      .select({
        id: matchRequests.id,
        status: matchRequests.status,
        created_at: matchRequests.createdAt,
      })
      .from(matchRequests)
      .where(and(eq(matchRequests.tripId, id), eq(matchRequests.requesterId, userId)))
      .limit(1);
    const posterRows = trip.userId
      ? await tx
          .select({
            display_name: publicProfiles.displayName,
            primary_language: publicProfiles.primaryLanguage,
            role: publicProfiles.role,
          })
          .from(publicProfiles)
          .where(eq(publicProfiles.id, trip.userId))
          .limit(1)
      : [];
    return { trip, existing: existingRows[0] ?? null, poster: posterRows[0] ?? null };
  });

  const { trip, existing, poster } = data;
  if (!trip) notFound();
  if (trip.userId === userId) redirect(`/trip/${id}`);
  if (trip.status !== 'open') redirect(`/trip/${id}`);

  const isFamilyPoster = poster?.role === 'family';

  return (
    <div className="container max-w-2xl py-10">
      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Send a request</p>
      <h1 className="mt-1 font-serif text-3xl">
        {isFamilyPoster
          ? `Offer to travel with ${poster.display_name ?? 'this family'}`
          : `Ask ${poster?.display_name ?? 'this companion'} for help`}
      </h1>

      <Card className="mt-6">
        <CardContent className="space-y-3 p-5">
          <RouteLine route={trip.route ?? []} />
          <div className="text-sm text-muted-foreground">
            {trip.travelDate
              ? new Date(trip.travelDate).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : ''}
          </div>
          <LanguageChipRow
            languages={trip.languages ?? []}
            primary={poster?.primary_language ?? null}
          />
        </CardContent>
      </Card>

      {existing ? (
        <Alert className="mt-6">
          <AlertTitle>You've already sent a request</AlertTitle>
          <AlertDescription>
            Status: <b>{existing.status}</b>. You'll get an email when the poster responds.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-8">
          <RequestForm
            tripId={id}
            posterName={poster?.display_name ?? 'the poster'}
            isFamilyPoster={isFamilyPoster}
          />
        </div>
      )}
    </div>
  );
}
