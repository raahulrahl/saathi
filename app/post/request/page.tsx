import type { Metadata } from 'next';
import { requireUserId } from '@/lib/auth-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PostWizard } from '../post-wizard';

export const metadata: Metadata = { title: 'Post a request' };

interface PostRequestPageProps {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}

export default async function PostRequestPage({ searchParams }: PostRequestPageProps) {
  const { from = '', to = '', date = '' } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId('/post/request');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, languages, primary_language')
    .eq('id', userId)
    .maybeSingle();

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="font-serif text-3xl">Post a request</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us about the trip. This goes live publicly right away (parent details stay private
        until a companion is accepted).
      </p>

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
