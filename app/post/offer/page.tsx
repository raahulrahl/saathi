import type { Metadata } from 'next';
import { requireUserId } from '@/lib/auth-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PostWizard } from '../post-wizard';

export const metadata: Metadata = { title: 'Offer to help' };

interface PostOfferPageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function PostOfferPage({ searchParams }: PostOfferPageProps) {
  const { from = '', to = '', date = '' } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId('/post/offer');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, languages, primary_language')
    .eq('id', userId)
    .maybeSingle();

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="font-serif text-3xl">Offer to help</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&rsquo;re already flying this route. A family somewhere is quietly hoping someone like
        you posts.
      </p>

      <div className="mt-8">
        <PostWizard
          kind="offer"
          profileLanguages={profile?.languages ?? []}
          defaults={{
            ...(from && to ? { route: [from.toUpperCase(), to.toUpperCase()] } : {}),
            ...(date ? { travel_date: date } : {}),
          }}
        />
      </div>
    </div>
  );
}
