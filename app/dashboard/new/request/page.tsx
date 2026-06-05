import type { Metadata } from 'next';
import { asc, desc, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import { profileLanguages } from '@/lib/db/schema';
import { TripPostClient } from '@/components/trip-post-client';

export const metadata: Metadata = { title: 'New request' };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function NewRequestPage({ searchParams }: PageProps) {
  const { from = '', to = '', date = '' } = await searchParams;
  const userId = await requireUserId('/dashboard/new/request');

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
        <p className="text-xs font-semibold uppercase tracking-widest text-matcha-600">
          New request
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
          Someone&rsquo;s flying alone.{' '}
          <span className="text-marigold-700">Find them a companion.</span>
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Tell us about the trip. It goes live publicly right away — parent details stay private
          until a companion is accepted.
        </p>
      </header>

      <TripPostClient
        kind="request"
        profileLanguages={langs.map((l) => l.language)}
        defaults={{
          ...(from && to ? { route: [from.toUpperCase(), to.toUpperCase()] } : {}),
          ...(date ? { travel_date: date } : {}),
        }}
      />
    </div>
  );
}
