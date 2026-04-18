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
import { TripShareButtons } from '@/components/trip-share-buttons';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HELP_CATEGORIES } from '@/lib/languages';

interface TripPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getsaathi.com';

export async function generateMetadata({ params }: TripPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('public_trips')
    .select('route, travel_date, kind, airline')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { title: 'Trip not found' };

  const routeStr = data.route.join(' → ');
  const dateStr = format(parseISO(data.travel_date), 'd LLL yyyy');
  const isRequest = data.kind === 'request';
  const title = isRequest ? `Companion wanted: ${routeStr}` : `Offering help: ${routeStr}`;
  const description = isRequest
    ? `Looking for a travel companion on ${routeStr} · ${dateStr}`
    : `${data.airline ? `${data.airline} · ` : ''}${routeStr} · ${dateStr} — find them on Saathi`;

  const pageUrl = `${SITE_URL}/trip/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'Saathi',
      type: 'website',
      // Next.js auto-adds the opengraph-image.tsx output here, but we can
      // also be explicit so sharing previews work before the first crawl.
      images: [
        {
          url: `${SITE_URL}/trip/${id}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${isRequest ? 'Request' : 'Offer'}: ${routeStr}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/trip/${id}/opengraph-image`],
    },
  };
}

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { id } = await params;
  const { new: isNewTrip } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: trip } = await supabase.from('public_trips').select('*').eq('id', id).maybeSingle();
  if (!trip) notFound();

  const [{ data: profile }, { data: reviewStats }] = await Promise.all([
    supabase.from('public_profiles').select('*').eq('id', trip.user_id).maybeSingle(),
    supabase.from('profile_review_stats').select('*').eq('user_id', trip.user_id).maybeSingle(),
  ]);

  const { userId } = await auth();
  const viewer = userId ?? null;
  const isOwner = viewer === trip.user_id;
  const isRequest = trip.kind === 'request';
  const helpLabels = new Map(HELP_CATEGORIES.map((h) => [h.key, h]));

  // Show the share prompt if this is the first landing after creation
  const showShareBanner = isOwner && isNewTrip === 'true';
  // Canonical public URL for this trip — passed down so the share buttons
  // always link to the production origin even when the dev is on localhost.
  // Facebook/WhatsApp crawlers can't reach localhost, so without this the
  // preview never loads.
  const pageUrl = `${SITE_URL}/trip/${id}`;

  return (
    <div className="container max-w-4xl py-8">
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/browse" className="hover:text-foreground">
          Browse
        </Link>
        <ChevronRight className="size-3" />
        <span>
          {trip.route[0]} → {trip.route[trip.route.length - 1]}
        </span>
      </nav>

      {/* Post-creation share banner — warm, human, not transactional */}
      {showShareBanner && (
        <div className="mb-6 rounded-2xl border border-matcha-600/20 bg-matcha-600/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              🌼
            </span>
            <p className="font-semibold text-matcha-800">
              {isRequest ? 'Your request has been shared' : 'Thank you for stepping forward'}
            </p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {isRequest
              ? 'A family somewhere less alone today. Share this with your network so a kind traveller can find you.'
              : 'Somewhere, a family just breathed a little easier. Share this in your WhatsApp or community group so the right person can find you.'}
          </p>
          <TripShareButtons
            tripId={id}
            route={trip.route}
            shareUrl={pageUrl}
            isRequest={isRequest}
            variant="banner"
          />
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <article className="space-y-6">
          <div>
            <Badge variant={isRequest ? 'slushie' : 'lemon'}>
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

          {isRequest && trip.traveller_count > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-serif text-lg">
                  {trip.traveller_count === 1
                    ? 'About the traveller'
                    : `${trip.traveller_count} travellers on this flight`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {trip.traveller_count === 1 ? (
                    <>
                      Age band <b>{trip.traveller_age_bands[0] ?? '—'}</b>.
                    </>
                  ) : (
                    <>
                      Age bands:{' '}
                      {trip.traveller_age_bands.map((b: string, i: number) => (
                        <span key={i}>
                          <b>{b}</b>
                          {i < trip.traveller_age_bands.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      .
                    </>
                  )}{' '}
                  Names and any notes stay hidden until the request is accepted.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <section>
            <h2 className="font-serif text-xl">
              {isRequest ? 'Languages they speak' : 'Languages the companion speaks'}
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
            <section className="bg-saffron-50 rounded-lg border p-4 text-sm">
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
                <>
                  <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                    This is your trip. Incoming requests show up in your{' '}
                    <Link href="/dashboard" className="underline">
                      dashboard
                    </Link>
                    .
                  </div>
                  <TripShareButtons
                    tripId={id}
                    route={trip.route}
                    shareUrl={pageUrl}
                    isRequest={isRequest}
                    variant="sidebar"
                  />
                </>
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
