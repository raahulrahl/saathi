import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PostWizard } from '../post-wizard';

export const metadata: Metadata = { title: 'Post a request' };

interface PostRequestPageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function PostRequestPage({ searchParams }: PostRequestPageProps) {
  const { from = '', to = '', date = '' } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) redirect('/auth/sign-in?next=/post/request');

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
      <h1 className="font-serif text-3xl">Post a request</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us about the trip. This goes live publicly right away (parent details stay private
        until a companion is accepted).
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
          kind="request"
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
