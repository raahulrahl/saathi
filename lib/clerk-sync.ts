import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { withService } from '@/lib/db';
import { profiles } from '@/lib/db/schema';

/**
 * Self-heal: ensure a public.profiles row exists for the current Clerk
 * user. Runs server-side on every authenticated page load that matters
 * (onboarding + post flows), so the app works even before the Clerk
 * webhook is wired up and recovers when the webhook misses an event.
 *
 * Uses withService (BYPASSRLS) because the profiles table has no INSERT
 * policy for the user themselves — inserts only come from the webhook /
 * this self-heal.
 *
 * History: this function also used to mirror each of Clerk's verified
 * external_accounts into a public.verifications table for trust badges.
 * That table was dropped in 0009_profile_schema_cleanup — we weren't
 * doing useful work with the rows. The Clerk session still carries all
 * the OAuth info if we want to display "signed in via X" live.
 */
export async function syncClerkUserToSupabase(userId: string): Promise<void> {
  const user = await currentUser();
  if (!user || user.id !== userId) return;

  // Diagnostic log — surfaces in server terminal + Sentry breadcrumbs.
  // Triggered once per authenticated page load, so volume is bounded.
  // eslint-disable-next-line no-console
  console.info('[clerk-sync] user', user.id, {
    externalAccountCount: user.externalAccounts?.length ?? 0,
  });

  const primaryEmail =
    user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified',
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;

  const displayName =
    [user.firstName, user.lastName?.[0] ? `${user.lastName[0]}.` : null]
      .filter(Boolean)
      .join(' ')
      .trim() || (primaryEmail ? primaryEmail.split('@')[0] : null);

  // Insert the profile once; never overwrite once it exists (onboarding
  // owns user-editable fields after creation). onConflictDoNothing handles
  // the duplicate-key on re-runs (this is the supabase `.then(ok, ignore)`
  // pattern, expressed as a SQL no-op rather than a JS error swallow).
  await withService((tx) =>
    tx
      .insert(profiles)
      .values({
        id: user.id,
        role: 'companion',
        displayName,
        photoUrl: user.imageUrl ?? null,
        email: primaryEmail,
      })
      .onConflictDoNothing(),
  );
}
