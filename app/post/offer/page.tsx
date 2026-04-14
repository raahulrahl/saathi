import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PostWizard } from '../post-wizard';

export const metadata: Metadata = { title: 'Offer to help' };

interface PostOfferPageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function PostOfferPage({ searchParams }: PostOfferPageProps) {
  const { from = '', to = '', date = '' } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) redirect('/auth/sign-in?next=/post/offer');

  const [{ data: profile }, { data: verifs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, languages, primary_language')
      .eq('id', userResp.user.id)
      .maybeSingle(),
    supabase.from('verifications').select('channel, verified_at').eq('user_id', userResp.user.id),
  ]);
  const verifiedCount = (verifs ?? []).filter((v) => v.verified_at).length;

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="font-serif text-3xl">Offer to help</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You're already flying this route. A family somewhere is quietly hoping someone like you
        posts.
      </p>

      {verifiedCount < 2 ? (
        <Alert variant="warm" className="mt-6">
          <AlertTitle>Finish onboarding first</AlertTitle>
          <AlertDescription>
            We need at least two verification channels before you can post.{' '}
            <a href="/onboarding" className="underline">
              Finish onboarding →
            </a>
          </AlertDescription>
        </Alert>
      ) : null}

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
