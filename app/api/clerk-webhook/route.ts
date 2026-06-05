import { NextResponse, type NextRequest } from 'next/server';
import { Webhook } from 'svix';
import { eq } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { profiles } from '@/lib/db/schema';

/**
 * Clerk webhook. Replaces the `handle_new_user` and `handle_identity_linked`
 * triggers from the pre-Clerk schema. Fires on:
 *
 *   - user.created          → insert a minimal profiles row. Onboarding
 *                             finishes populating languages / display_name.
 *   - user.updated          → sync external_accounts and verified
 *                             email_addresses into the verifications table,
 *                             so the badge count reflects reality.
 *   - session.created       → (noop for now; hook point for analytics later)
 *
 * Security: Svix signature verification using CLERK_WEBHOOK_SECRET.
 */

interface ClerkExternalAccount {
  provider: string; // 'oauth_google' | 'oauth_linkedin_oidc' | 'oauth_x' | 'oauth_github' | ...
  email_address?: string | null;
  username?: string | null;
  verification?: { status?: string | null } | null;
  public_metadata?: Record<string, unknown> | null;
}

interface ClerkEmailAddress {
  email_address: string;
  verification?: { status?: string | null } | null;
}

interface ClerkUserData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  external_accounts?: ClerkExternalAccount[];
}

type ClerkWebhookEvent =
  | { type: 'user.created' | 'user.updated'; data: ClerkUserData }
  | { type: 'session.created'; data: Record<string, unknown> }
  | { type: string; data: Record<string, unknown> };

/**
 * Map Clerk's provider string to our verifications.channel enum.
 * Matches by substring: Clerk sends variants across versions
 * ('oauth_linkedin_oidc', 'linkedin_oidc', 'Linkedin_oidc') and strict
 * equality would silently drop any of them. See lib/clerk-sync.ts for
 * the same mapping.
 */
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

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Svix signature verification
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 });
  }

  const payload = await request.text();
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (event.type === 'user.created' || event.type === 'user.updated') {
    const u = event.data as ClerkUserData;
    if (!u.id) {
      return NextResponse.json({ error: 'user.id missing' }, { status: 400 });
    }

    const primaryEmail =
      u.email_addresses?.find((e) => e.email_address && e.verification?.status === 'verified')
        ?.email_address ??
      u.email_addresses?.[0]?.email_address ??
      null;

    const displayName = [u.first_name, u.last_name?.[0]].filter(Boolean).join(' ') || null;

    if (event.type === 'user.created') {
      // Create the profiles row. Defaults that onboarding overwrites.
      // Languages live in profile_languages now and are seeded by the
      // onboarding form — not here — so users pick their own rather
      // than inheriting a default English they never asked for.
      try {
        await withService((tx) =>
          tx
            .insert(profiles)
            .values({
              id: u.id,
              role: 'companion', // default; user switches in onboarding
              displayName,
              photoUrl: u.image_url ?? null,
              email: primaryEmail,
            })
            .onConflictDoUpdate({
              target: profiles.id,
              set: {
                displayName,
                photoUrl: u.image_url ?? null,
                email: primaryEmail,
              },
            }),
        );
      } catch (err) {
        return NextResponse.json(
          { error: `profiles upsert: ${(err as Error).message}` },
          { status: 500 },
        );
      }
    } else {
      // user.updated: only refresh fields Clerk can change.
      try {
        await withService((tx) =>
          tx
            .update(profiles)
            .set({ photoUrl: u.image_url ?? null, email: primaryEmail })
            .where(eq(profiles.id, u.id)),
        );
      } catch {
        // best-effort
      }
    }

    // NOTE: we used to mirror verified OAuth accounts into a
    // public.verifications table for trust badges. That table was
    // dropped in 0009 — verification wasn't doing useful work after
    // the onboarding simplification (no 2-of-N gate, inconsistent
    // trust signal). providerToChannel() remains in the file as
    // defensive documentation of which OAuth providers we support.
    void providerToChannel; // keep ref for future re-use
  }

  // user.deleted: drop the profiles row. Every FK into profiles is
  // declared ON DELETE CASCADE, so trips, matches, messages, reviews,
  // reports, blocks, verifications, trip_travellers, trip_legs, and
  // pending_notifications all follow automatically. No orphan rows,
  // no extra cleanup code. Closes bug L04 and keeps the door open
  // for a future "delete my account" / GDPR-erasure feature.
  if (event.type === 'user.deleted') {
    const u = event.data as { id?: string; deleted?: boolean };
    if (!u.id) {
      return NextResponse.json({ error: 'user.id missing' }, { status: 400 });
    }
    try {
      await withService((tx) => tx.delete(profiles).where(eq(profiles.id, u.id!)));
    } catch (err) {
      return NextResponse.json(
        { error: `profile delete: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  // session.created and everything else: ignored for now.
  return NextResponse.json({ ok: true });
}
