import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Self-heal: mirror Clerk's user state into public.profiles and
 * public.verifications. Runs server-side on every authenticated page load
 * that matters, so the app works even before the Clerk webhook is wired up
 * — and stays correct when the webhook misses an event.
 *
 * Uses the service role client (bypasses RLS) because:
 *   * profiles has no INSERT policy for the user themselves — inserts
 *     are supposed to come from a trusted source.
 *   * verifications are derived from Clerk's identity state, which is
 *     effectively a trusted source.
 */

type Verif = {
  user_id: string;
  channel: string;
  handle: string;
  verified_at: string;
  proof: Record<string, unknown>;
};

// Mirrors app/api/clerk-webhook/route.ts — maps whichever OAuth providers
// are enabled in Clerk to our verifications.channel enum.
//
// Matches by substring rather than exact string: Clerk has varied the
// provider slug across versions ('oauth_linkedin_oidc', 'linkedin_oidc',
// 'Linkedin_oidc' — the casing we literally saw in a user error) and a
// strict switch silently dropped verified accounts on the floor when the
// slug didn't match any case. Substring match is resilient to any of
// these variants.
//
// Note: as of the onboarding simplification, verifications aren't a gate
// anymore — any signed-in user can post. We still mirror OAuth identities
// into the verifications table for trust badges on profile cards and
// future trust-scoring.
function providerToChannel(provider: string): string | null {
  const p = provider.toLowerCase();
  if (p.includes('linkedin')) return 'linkedin';
  if (p.includes('twitter') || p === 'oauth_x' || p === 'x' || p.endsWith('_x')) {
    return 'twitter';
  }
  if (p.includes('google')) return 'google';
  if (p.includes('facebook')) return 'facebook';
  return null;
}

export async function syncClerkUserToSupabase(userId: string): Promise<void> {
  const user = await currentUser();
  if (!user || user.id !== userId) return;

  const supabase = createSupabaseServiceClient();

  // Diagnostic log — surfaces in server terminal + Sentry breadcrumbs.
  // Triggered once per authenticated page load, so volume is bounded.
  // If a user complains "LinkedIn isn't showing as verified" we can see
  // immediately whether Clerk is returning the external account and what
  // provider string it came back with.
  // eslint-disable-next-line no-console
  console.info('[clerk-sync] user', user.id, {
    externalAccountCount: user.externalAccounts?.length ?? 0,
    providers: (user.externalAccounts ?? []).map((a) => ({
      provider: a.provider,
      status: a.verification?.status,
    })),
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
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

  // Insert the profile once; never overwrite once it exists (onboarding form
  // owns user-editable fields after creation).
  await supabase
    .from('profiles')
    .insert({
      id: user.id,
      role: 'companion',
      display_name: displayName,
      full_name: fullName,
      photo_url: user.imageUrl ?? null,
      email: primaryEmail,
      languages: ['English'],
      primary_language: 'English',
    })
    .then(
      () => undefined,
      () => undefined, // ignore duplicate-key; the profile already exists
    );

  // Always refresh verifications — Clerk is source of truth. Email is
  // intentionally NOT a verification channel: every Clerk sign-up verifies
  // an email, so counting it would give a "free" badge and devalue the
  // ≥2-channel minimum. The `email` column on profiles still holds it for
  // login + notifications.
  const verifs: Verif[] = [];
  const now = new Date().toISOString();

  for (const acc of user.externalAccounts ?? []) {
    if (acc.verification?.status !== 'verified') continue;
    const channel = providerToChannel(acc.provider);
    if (!channel) continue;
    verifs.push({
      user_id: user.id,
      channel,
      handle: acc.username ?? acc.emailAddress ?? '',
      verified_at: now,
      proof: { via: 'clerk', provider: acc.provider },
    });
  }

  if (verifs.length > 0) {
    await supabase.from('verifications').upsert(verifs, { onConflict: 'user_id,channel' });
  }
}
