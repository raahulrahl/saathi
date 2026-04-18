import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LanguageChipRow } from '@/components/language-chip';
import { TripCard, type TripCardData } from '@/components/trip-card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('public_profiles')
    .select('display_name, role')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { title: 'Profile not found' };
  return {
    title: `${data.display_name ?? 'Member'} · ${data.role}`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: stats }, { data: trips }, { data: reviews }] =
    await Promise.all([
      supabase.from('public_profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('profile_review_stats').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('public_trips').select('*').eq('user_id', id).eq('status', 'open'),
      supabase
        .from('reviews')
        .select('rating, body, created_at')
        .eq('reviewee_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

  if (!profile) notFound();

  return (
    <div className="container max-w-4xl py-10">
      <header className="flex flex-col items-start gap-6 sm:flex-row">
        <Avatar className="size-24">
          {profile.photo_url ? (
            <AvatarImage asChild>
              <Image
                src={profile.photo_url}
                alt=""
                width={96}
                height={96}
                className="size-24 object-cover"
                unoptimized
              />
            </AvatarImage>
          ) : null}
          <AvatarFallback>{(profile.display_name ?? '??').slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-3">
          <div>
            <h1 className="font-serif text-3xl">{profile.display_name ?? 'Anonymous'}</h1>
            <p className="text-sm capitalize text-muted-foreground">
              {profile.role === 'family' ? 'Family member' : 'Companion'}
            </p>
          </div>
          {profile.bio ? <p className="text-sm leading-relaxed">{profile.bio}</p> : null}
          <LanguageChipRow languages={profile.languages} primary={profile.primary_language} />
          {/* Self-reported social profile links. Not OAuth-verified — the
              onboarding form just takes URLs. Rendered as small icon
              buttons; inert if missing. */}
          {(profile.linkedin_url ||
            profile.facebook_url ||
            profile.twitter_url ||
            profile.instagram_url) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs uppercase tracking-wider text-warm-silver">
                Find them on
              </span>
              {profile.linkedin_url ? (
                <SocialLink href={profile.linkedin_url} label="LinkedIn" icon={Linkedin} />
              ) : null}
              {profile.facebook_url ? (
                <SocialLink href={profile.facebook_url} label="Facebook" icon={Facebook} />
              ) : null}
              {profile.twitter_url ? (
                <SocialLink href={profile.twitter_url} label="X / Twitter" icon={Twitter} />
              ) : null}
              {profile.instagram_url ? (
                <SocialLink href={profile.instagram_url} label="Instagram" icon={Instagram} />
              ) : null}
            </div>
          )}
        </div>
      </header>

      <Separator className="my-8" />

      <section className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="font-serif text-xl">Open trips</h2>
          <div className="mt-4 space-y-4">
            {trips && trips.length > 0 ? (
              trips.map((t) => {
                const card: TripCardData = {
                  id: t.id,
                  kind: t.kind,
                  display_name: profile.display_name,
                  photo_url: profile.photo_url,
                  languages: t.languages,
                  primary_language: profile.primary_language,
                  route: t.route,
                  travel_date: t.travel_date,
                  traveller_age_bands: t.traveller_age_bands ?? [],
                  traveller_count: t.traveller_count ?? 0,
                  help_categories: t.help_categories,
                  thank_you_eur: t.thank_you_eur,
                  airline: t.airline,
                };
                return <TripCard key={t.id} data={card} />;
              })
            ) : (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">
                  No open trips at the moment.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <aside>
          <h2 className="font-serif text-xl">Reviews</h2>
          {stats?.review_count ? (
            <div className="mt-3 flex items-baseline gap-2">
              <div className="font-serif text-3xl">{stats.average_rating}</div>
              <div className="text-sm text-muted-foreground">
                across {stats.review_count} completed trip{stats.review_count === 1 ? '' : 's'}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No completed trips yet.</p>
          )}
          <ul className="mt-4 space-y-3">
            {(reviews ?? []).map((r, idx) => (
              <li key={idx} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="success">★ {r.rating}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.body ? <p className="mt-2 text-muted-foreground">{r.body}</p> : null}
              </li>
            ))}
          </ul>
          <Link
            href={`/report?subject=${id}`}
            className="mt-6 block text-xs text-muted-foreground underline"
          >
            Report this profile
          </Link>
        </aside>
      </section>
    </div>
  );
}

/**
 * Social profile link chip. Externally linked with noopener/noreferrer
 * because these are user-submitted URLs we do not verify — they could
 * point anywhere — and we don't want them leaking our referrer.
 */
function SocialLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Open ${label} profile`}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-full border border-oat bg-white px-3 py-1 text-xs font-medium text-warm-charcoal hover:bg-oat-light"
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </a>
  );
}
