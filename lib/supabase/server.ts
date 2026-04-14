import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

/**
 * Server-side Supabase client that trusts Clerk as the auth source.
 *
 * How it works:
 *   1. Clerk signs a JWT using Supabase's JWT secret via a "supabase" JWT
 *      template (created in the Clerk dashboard).
 *   2. We fetch that JWT here via `auth().getToken({ template: 'supabase' })`.
 *   3. We pass it as a Bearer token on every Supabase request.
 *   4. Supabase decodes the claim `sub` as the Clerk user id.
 *   5. Our RLS policies call `public.clerk_user_id()` (from 0005_clerk.sql),
 *      which reads that same `sub` as text — matching `profiles.id`.
 *
 * For anonymous viewers (no Clerk session) we fall back to the anon key,
 * which is what the public search / trip / profile pages need.
 */
export async function createSupabaseServerClient() {
  const { getToken } = await auth();
  const clerkToken = await getToken({ template: 'supabase' }).catch(() => null);

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      global: {
        headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely — only use from server-side
 * code that needs to create users (webhooks) or run the cron. Never call
 * from a code path that can be reached by a browser.
 */
export function createSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
