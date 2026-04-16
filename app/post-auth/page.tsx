import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/auth-guard';
import { syncClerkUserToSupabase } from '@/lib/clerk-sync';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Post-authentication landing page.
 *
 * Clerk sends everyone here after sign-in / sign-up. This page decides
 * where they actually belong based on profile completeness:
 *
 *   - No languages saved yet → first-time user, send to /onboarding.
 *   - Languages exist        → returning user, send to /dashboard.
 *
 * Why `profile_languages` and not `profile.role`? The Clerk self-heal
 * (`syncClerkUserToSupabase`) creates a profile row with `role:
 * 'companion'` as a NOT NULL default on every sign-up. That means
 * `role` is always set — even before the user fills the onboarding
 * form. Languages, on the other hand, are ONLY inserted by the
 * onboarding form's server action (`min(1)` enforced). Zero language
 * rows = hasn't onboarded.
 */
export default async function PostAuthPage() {
  const userId = await requireUserId('/post-auth');

  // Self-heal: ensure a profile row exists.
  await syncClerkUserToSupabase(userId);

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('profile_languages')
    .select('language', { count: 'exact', head: true })
    .eq('profile_id', userId);

  if (!count || count === 0) {
    redirect('/onboarding');
  }

  redirect('/dashboard');
}
