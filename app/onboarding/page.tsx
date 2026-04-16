import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/auth-guard';
import { syncClerkUserToSupabase } from '@/lib/clerk-sync';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

interface OnboardingPageProps {
  searchParams: Promise<{ edit?: string }>;
}

export const metadata: Metadata = { title: 'Welcome · Saathi' };

/**
 * Onboarding is now a single short form. The earlier version required
 * users to link ≥2 OAuth providers and verify WhatsApp via Twilio OTP
 * before they could post — way too much friction pre-launch, and users
 * were dropping off at the verification step.
 *
 * New flow:
 *   1. Clerk handles sign-in (any of Google / Facebook / LinkedIn / X).
 *   2. syncClerkUserToSupabase inserts a default profile row on arrival.
 *   3. This page loads that row into a form for the user to finish — role,
 *      languages, WhatsApp number (plain field, no OTP), optional bio.
 *   4. Submit writes through a server action and redirects to /dashboard.
 *
 * No gating, no verification channels, no "you need 2 more links." Anyone
 * signed in and through this form can post / request / browse.
 *
 * The verifications table is still maintained behind the scenes by the
 * Clerk webhook + self-heal — we use it for trust badges on profile
 * cards, not as a gate.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { edit } = await searchParams;
  const userId = await requireUserId('/onboarding');

  // Self-heal: create/update profile row from Clerk state.
  await syncClerkUserToSupabase(userId);

  const supabase = await createSupabaseServerClient();
  // Belt-and-braces: if a returning user lands here (stale env var,
  // legacy Clerk session, direct URL), check whether they've already
  // completed onboarding by looking at profile_languages — those rows
  // are ONLY written by the onboarding server action.
  // ?edit=1 from dashboard bypasses this so profile editing still works.
  if (edit !== '1') {
    const { count } = await supabase
      .from('profile_languages')
      .select('language', { count: 'exact', head: true })
      .eq('profile_id', userId);
    if (count && count > 0) {
      redirect('/dashboard');
    }
  }
  // Profile + languages come from two tables now (normalised join).
  // Run both reads in parallel — they don't depend on each other and
  // this is the onboarding page's critical path on every render.
  const [{ data: profile }, { data: langs }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        `id, role, display_name, bio,
         whatsapp_number, whatsapp_validated_at,
         linkedin_url, facebook_url, twitter_url, instagram_url`,
      )
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('profile_languages')
      .select('language, is_primary')
      .eq('profile_id', userId)
      .order('is_primary', { ascending: false })
      .order('language', { ascending: true }),
  ]);

  // Surface languages primary-first so the form's first chip matches
  // the primary selection convention.
  const selectedLanguages = (langs ?? []).map((l) => l.language);

  // The same form doubles as "edit your profile" — the dashboard has an
  // Edit button that links back here. If the user already has a role set
  // we treat it as edit-mode (different heading, same form).
  const isEditing = !!profile?.role;

  return (
    <div className="container max-w-xl py-14">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
          {isEditing ? (
            <>
              Edit your <span className="text-marigold-700">Saathi</span> profile
            </>
          ) : (
            <>
              Welcome to <span className="text-marigold-700">Saathi</span>.
            </>
          )}
        </h1>
        <p className="text-base leading-relaxed text-warm-charcoal">
          {isEditing
            ? 'Update anything below. Changes save to your public profile immediately.'
            : 'Just a few details so other travellers know who they’re meeting. Takes a minute.'}
        </p>
      </div>

      <div className="mt-10">
        <OnboardingForm
          initialValues={{
            displayName: profile?.display_name ?? '',
            role: (profile?.role as 'family' | 'companion' | null) ?? null,
            languages: selectedLanguages,
            whatsappNumber: profile?.whatsapp_number ?? '',
            whatsappValidatedAt: profile?.whatsapp_validated_at ?? null,
            bio: profile?.bio ?? '',
            linkedinUrl: profile?.linkedin_url ?? '',
            facebookUrl: profile?.facebook_url ?? '',
            twitterUrl: profile?.twitter_url ?? '',
            instagramUrl: profile?.instagram_url ?? '',
          }}
        />
      </div>
    </div>
  );
}
