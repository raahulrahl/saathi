import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { and, desc, eq } from 'drizzle-orm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LanguageChipRow } from '@/components/language-chip';
import { TripCard, type TripCardData } from '@/components/trip-card';
import { withUser } from '@/lib/db';
import {
  profileReviewStats,
  publicProfiles,
  publicTrips,
  reviews as reviewsTbl,
} from '@/lib/db/schema';

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await withUser(null, async (tx) => {
    const rows = await tx
      .select({ display_name: publicProfiles.displayName, role: publicProfiles.role })
      .from(publicProfiles)
      .where(eq(publicProfiles.id, id))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!data) return { title: 'Profile not found' };
  return {
    title: `${data.display_name ?? 'Member'} · ${data.role}`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;

  // Anon-readable through the security_invoker views.
  const data = await withUser(null, async (tx) => {
    const profileRows = await tx
      .select()
      .from(publicProfiles)
      .where(eq(publicProfiles.id, id))
      .limit(1);
    const statsRows = await tx
      .select()
      .from(profileReviewStats)
      .where(eq(profileReviewStats.userId, id))
      .limit(1);
    const trips = await tx
      .select()
      .from(publicTrips)
      .where(and(eq(publicTrips.userId, id), eq(publicTrips.status, 'open')));
    const reviews = await tx
      .select({
        rating: reviewsTbl.rating,
        body: reviewsTbl.body,
        created_at: reviewsTbl.createdAt,
      })
      .from(reviewsTbl)
      .where(eq(reviewsTbl.revieweeId, id))
      .orderBy(desc(reviewsTbl.createdAt))
      .limit(20);
    return {
      profile: profileRows[0] ?? null,
      stats: statsRows[0] ?? null,
      trips,
      reviews,
    };
  });

  const { profile, stats, trips, reviews } = data;
  if (!profile) notFound();

  return (
    <div className="container max-w-4xl py-10">
      <header className="flex flex-col items-start gap-6 sm:flex-row">
        <Avatar className="size-24">
          {profile.photoUrl ? (
            <AvatarImage asChild>
              <Image
                src={profile.photoUrl}
                alt=""
                width={96}
                height={96}
                className="size-24 object-cover"
                unoptimized
              />
            </AvatarImage>
          ) : null}
          <AvatarFallback>{(profile.displayName ?? '??').slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-3">
          <div>
            <h1 className="font-serif text-3xl">{profile.displayName ?? 'Anonymous'}</h1>
            <p className="text-sm capitalize text-muted-foreground">
              {profile.role === 'family' ? 'Family member' : 'Companion'}
            </p>
          </div>
          {profile.bio ? <p className="text-sm leading-relaxed">{profile.bio}</p> : null}
          <LanguageChipRow
            languages={profile.languages ?? []}
            primary={profile.primaryLanguage ?? null}
          />
          {(profile.linkedinUrl ||
            profile.facebookUrl ||
            profile.twitterUrl ||
            profile.instagramUrl) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs uppercase tracking-wider text-warm-silver">
                Find them on
              </span>
              {profile.linkedinUrl ? (
                <SocialLink href={profile.linkedinUrl} label="LinkedIn" icon={Linkedin} />
              ) : null}
              {profile.facebookUrl ? (
                <SocialLink href={profile.facebookUrl} label="Facebook" icon={Facebook} />
              ) : null}
              {profile.twitterUrl ? (
                <SocialLink href={profile.twitterUrl} label="X / Twitter" icon={Twitter} />
              ) : null}
              {profile.instagramUrl ? (
                <SocialLink href={profile.instagramUrl} label="Instagram" icon={Instagram} />
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
            {trips.length > 0 ? (
              trips.map((t) => {
                const card: TripCardData = {
                  id: t.id!,
                  kind: t.kind!,
                  display_name: profile.displayName,
                  photo_url: profile.photoUrl,
                  languages: t.languages ?? [],
                  primary_language: profile.primaryLanguage ?? null,
                  route: t.route ?? [],
                  travel_date: t.travelDate!,
                  traveller_age_bands: t.travellerAgeBands ?? [],
                  traveller_count: t.travellerCount ?? 0,
                  help_categories: t.helpCategories ?? [],
                  thank_you_eur: t.thankYouEur,
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
          {stats?.reviewCount ? (
            <div className="mt-3 flex items-baseline gap-2">
              <div className="font-serif text-3xl">{stats.averageRating}</div>
              <div className="text-sm text-muted-foreground">
                across {stats.reviewCount} completed trip{stats.reviewCount === 1 ? '' : 's'}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No completed trips yet.</p>
          )}
          <ul className="mt-4 space-y-3">
            {reviews.map((r, idx) => (
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
