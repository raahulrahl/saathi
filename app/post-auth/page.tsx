import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth-guard';
import { syncClerkUserToSupabase } from '@/lib/clerk-sync';
import { withUser } from '@/lib/db';
import { profileLanguages } from '@/lib/db/schema';

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

  const count = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(profileLanguages)
      .where(eq(profileLanguages.profileId, userId));
    return rows[0]?.c ?? 0;
  });

  if (!count) {
    redirect('/onboarding');
  }

  redirect('/dashboard');
}
