import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth-guard';
import { syncClerkUser } from '@/lib/clerk-sync';
import { withUser } from '@/lib/db';
import { profileLanguages, profiles } from '@/lib/db/schema';
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
 *   2. syncClerkUser inserts a default profile row on arrival.
 *   3. This page loads that row into a form for the user to finish — role,
 *      languages, WhatsApp number (plain field, no OTP), optional bio.
 *   4. Submit writes through a server action and redirects to /dashboard.
 *
 * No gating, no verification channels, no "you need 2 more links." Anyone
 * signed in and through this form can post / request / browse.
 *
 * The verifications table was dropped in 0009 — trust badges are no
 * longer surfaced.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { edit } = await searchParams;
  const userId = await requireUserId('/onboarding');

  // Self-heal: create/update profile row from Clerk state.
  await syncClerkUser(userId);

  // Belt-and-braces: if a returning user lands here (stale env var,
  // legacy Clerk session, direct URL), check whether they've already
  // completed onboarding by looking at profile_languages — those rows
  // are ONLY written by the onboarding server action.
  // ?edit=1 from dashboard bypasses this so profile editing still works.
  if (edit !== '1') {
    const langCount = await withUser(userId, async (tx) => {
      const rows = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(profileLanguages)
        .where(eq(profileLanguages.profileId, userId));
      return rows[0]?.c ?? 0;
    });
    if (langCount > 0) {
      redirect('/dashboard');
    }
  }

  // Profile + languages come from two tables now (normalised join).
  // Sequential inside one user tx — postgres.js serializes within a tx
  // anyway (Promise.all wouldn't have parallelized).
  const { profile, langs } = await withUser(userId, async (tx) => {
    const profileRows = await tx
      .select({
        id: profiles.id,
        role: profiles.role,
        display_name: profiles.displayName,
        bio: profiles.bio,
        whatsapp_number: profiles.whatsappNumber,
        whatsapp_validated_at: profiles.whatsappValidatedAt,
        linkedin_url: profiles.linkedinUrl,
        facebook_url: profiles.facebookUrl,
        twitter_url: profiles.twitterUrl,
        instagram_url: profiles.instagramUrl,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    const langs = await tx
      .select({ language: profileLanguages.language, isPrimary: profileLanguages.isPrimary })
      .from(profileLanguages)
      .where(eq(profileLanguages.profileId, userId))
      .orderBy(desc(profileLanguages.isPrimary), asc(profileLanguages.language));
    return { profile: profileRows[0] ?? null, langs };
  });

  // Surface languages primary-first so the form's first chip matches
  // the primary selection convention.
  const selectedLanguages = langs.map((l) => l.language);

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
