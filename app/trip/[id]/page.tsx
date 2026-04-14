import { auth } from '@clerk/nextjs/server';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Calendar, ChevronRight, Info, MapPin, ShieldAlert } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { VerifiedBadge, VerifiedBadgeCount } from '@/components/verified-badge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HELP_CATEGORIES } from '@/lib/languages';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TripPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('public_trips')
    .select('route, travel_date, kind')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { title: 'Trip not found' };
  return {
    title: `${data.kind === 'request' ? 'Request' : 'Offer'}: ${data.route.join(' → ')}`,
    description: `${format(parseISO(data.travel_date), 'd LLL yyyy')} — on Saathi`,
  };
}

export default async function TripPage({ params }: TripPageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: trip } = await supabase.from('public_trips').select('*').eq('id', id).maybeSingle();
  if (!trip) notFound();

  const [{ data: profile }, { data: verifs }, { data: reviewStats }] = await Promise.all([
    supabase.from('public_profiles').select('*').eq('id', trip.user_id).maybeSingle(),
    supabase
      .from('public_verifications')
      .select('channel, verified_at')
      .eq('user_id', trip.user_id),
    supabase.from('profile_review_stats').select('*').eq('user_id', trip.user_id).maybeSingle(),
  ]);

  const { userId } = await auth();
  const viewer = userId ?? null;
  const isOwner = viewer === trip.user_id;
  const isRequest = trip.kind === 'request';
  const helpLabels = new Map(HELP_CATEGORIES.map((h) => [h.key, h]));

  return (
    <div className="container max-w-4xl py-8">
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/search" className="hover:text-foreground">
          Browse
        </Link>
        <ChevronRight className="size-3" />
        <span>
          {trip.route[0]} → {trip.route[trip.route.length - 1]}
        </span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <article className="space-y-6">
          <div>
            <Badge variant={isRequest ? 'secondary' : 'default'}>
              {isRequest ? 'Family looking for a companion' : 'Traveller offering help'}
            </Badge>
            <h1 className="mt-3 font-serif text-3xl">
              {isRequest ? 'Companion wanted' : 'Available to help'}
            </h1>
            <div className="mt-3">
              <RouteLine route={trip.route} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              {format(parseISO(trip.travel_date), 'EEEE, d LLLL yyyy')}
              {trip.airline ? (
                <>
                  <span className="mx-1">·</span>
                  <MapPin className="size-4" />
                  {trip.airline}
                </>
              ) : null}
            </p>
            {trip.flight_numbers && trip.flight_numbers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {trip.flight_numbers.map((fn: string) => (
                  <Badge key={fn} variant="outline" className="font-mono">
                    ✈ {fn}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          {isRequest && trip.elderly_age_band ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-serif text-lg">About the parent</h2>
                <p className="text-sm text-muted-foreground">
                  Age band <b>{trip.elderly_age_band}</b>. Name, photo and any medical notes are
                  hidden until the request is accepted.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <section>
            <h2 className="font-serif text-xl">
              {isRequest ? 'Languages the parent speaks' : 'Languages the companion speaks'}
            </h2>
            <div className="mt-3">
              <LanguageChipRow
                languages={trip.languages}
                primary={profile?.primary_language ?? null}
              />
            </div>
          </section>

          {trip.help_categories && trip.help_categories.length > 0 ? (
            <section>
              <h2 className="font-serif text-xl">Help needed</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {trip.help_categories.map((k: string) => {
                  const h = helpLabels.get(k);
                  return (
                    <li key={k} className="rounded-md border p-3">
                      <div className="text-sm font-medium">{h?.label ?? k}</div>
                      {h?.description ? (
                        <div className="text-xs text-muted-foreground">{h.description}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {trip.notes ? (
            <section>
              <h2 className="font-serif text-xl">Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{trip.notes}</p>
            </section>
          ) : null}

          {isRequest && trip.thank_you_eur ? (
            <section className="rounded-lg border bg-saffron-50 p-4 text-sm">
              <b>Thank-you: €{trip.thank_you_eur}.</b> Settled directly between family and companion
              — Saathi never touches payments.
            </section>
          ) : null}
        </article>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <Link href={`/profile/${trip.user_id}`} className="flex items-center gap-3">
                <Avatar className="size-14">
                  {profile?.photo_url ? (
                    <AvatarImage asChild>
                      <Image
                        src={profile.photo_url}
                        alt=""
                        width={56}
                        height={56}
                        className="size-14 object-cover"
                        unoptimized
                      />
                    </AvatarImage>
                  ) : null}
                  <AvatarFallback>{(profile?.display_name ?? '??').slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{profile?.display_name ?? 'Anonymous'}</div>
                  <div className="text-xs capitalize text-muted-foreground">{profile?.role}</div>
                </div>
              </Link>

              <div className="space-y-2">
                <VerifiedBadgeCount count={profile?.verified_channel_count ?? 0} />
                <div className="flex flex-wrap gap-1.5">
                  {(verifs ?? []).map((v) => (
                    <VerifiedBadge key={v.channel} channel={v.channel} />
                  ))}
                </div>
              </div>

              {reviewStats?.review_count ? (
                <div className="text-sm">
                  <span className="font-semibold">{reviewStats.average_rating}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    ({reviewStats.review_count} review
                    {reviewStats.review_count === 1 ? '' : 's'})
                  </span>
                </div>
              ) : null}

              {isOwner ? (
                <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                  This is your trip. Incoming requests show up in your{' '}
                  <Link href="/dashboard" className="underline">
                    dashboard
                  </Link>
                  .
                </div>
              ) : viewer ? (
                <Button asChild className="w-full" size="lg">
                  <Link href={`/trip/${id}/request`}>
                    Send a request <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild className="w-full" size="lg">
                  <Link href={`/auth/sign-in?next=/trip/${id}/request`}>
                    Sign in to send a request
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Contact details unlock once the poster accepts your request. Until then only display
              names and verified channels are visible.
            </p>
          </div>

          {!isOwner ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                If something feels off,{' '}
                <Link href={`/report?subject=${trip.user_id}`} className="underline">
                  report this profile
                </Link>
                .
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
