import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RequestForm } from './request-form';

export const metadata: Metadata = { title: 'Send a request' };

export default async function SendRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) redirect(`/auth/sign-in?next=/trip/${id}/request`);

  const { data: trip } = await supabase.from('public_trips').select('*').eq('id', id).maybeSingle();
  if (!trip) notFound();
  if (trip.user_id === userResp.user.id) redirect(`/trip/${id}`);
  if (trip.status !== 'open') redirect(`/trip/${id}`);

  const [{ data: existing }, { data: verifs }, { data: poster }] = await Promise.all([
    supabase
      .from('match_requests')
      .select('id, status, created_at')
      .eq('trip_id', id)
      .eq('requester_id', userResp.user.id)
      .maybeSingle(),
    supabase.from('verifications').select('channel, verified_at').eq('user_id', userResp.user.id),
    supabase
      .from('public_profiles')
      .select('display_name, primary_language, role')
      .eq('id', trip.user_id)
      .maybeSingle(),
  ]);

  const verifiedCount = (verifs ?? []).filter((v) => v.verified_at).length;
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
          <RouteLine route={trip.route} />
          <div className="text-sm text-muted-foreground">
            {new Date(trip.travel_date).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
          <LanguageChipRow languages={trip.languages} primary={poster?.primary_language ?? null} />
        </CardContent>
      </Card>

      {verifiedCount < 2 ? (
        <Alert variant="warm" className="mt-6">
          <AlertTitle>Verify two channels first</AlertTitle>
          <AlertDescription>
            Please link at least two verification channels before sending a request.{' '}
            <a href="/onboarding" className="underline">
              Finish onboarding →
            </a>
          </AlertDescription>
        </Alert>
      ) : existing ? (
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
