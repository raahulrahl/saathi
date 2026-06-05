import type { Metadata } from 'next';
import { asc, desc, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import { profileLanguages } from '@/lib/db/schema';
import { TripPostClient } from '@/components/trip-post-client';

export const metadata: Metadata = { title: 'New offer' };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function NewOfferPage({ searchParams }: PageProps) {
  const { from = '', to = '', date = '' } = await searchParams;
  const userId = await requireUserId('/dashboard/new/offer');

  const langs = await withUser(userId, (tx) =>
    tx
      .select({ language: profileLanguages.language, isPrimary: profileLanguages.isPrimary })
      .from(profileLanguages)
      .where(eq(profileLanguages.profileId, userId))
      .orderBy(desc(profileLanguages.isPrimary), asc(profileLanguages.language)),
  );

  return (
    <div className="container max-w-6xl py-10">
      <header className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-matcha-600">New offer</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
          You&rsquo;re already flying there.{' '}
          <span className="text-marigold-700">Why not help someone?</span>
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          A family somewhere is quietly hoping someone like you posts. Tell us your route and
          we&rsquo;ll handle the rest.
        </p>
      </header>

      <TripPostClient
        kind="offer"
        profileLanguages={langs.map((l) => l.language)}
        defaults={{
          ...(from && to ? { route: [from.toUpperCase(), to.toUpperCase()] } : {}),
          ...(date ? { travel_date: date } : {}),
        }}
      />
    </div>
  );
}
