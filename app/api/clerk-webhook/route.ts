import { NextResponse, type NextRequest } from 'next/server';
import { Webhook } from 'svix';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

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

  const supabase = createSupabaseServiceClient();

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
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;

    if (event.type === 'user.created') {
      // Create the profiles row. Defaults that onboarding overwrites.
      const { error } = await supabase.from('profiles').upsert(
        {
          id: u.id,
          role: 'companion', // default; user switches in onboarding
          display_name: displayName,
          full_name: fullName,
          photo_url: u.image_url ?? null,
          email: primaryEmail,
          languages: ['English'],
          primary_language: 'English',
        },
        { onConflict: 'id' },
      );
      if (error) {
        return NextResponse.json({ error: `profiles upsert: ${error.message}` }, { status: 500 });
      }
    } else {
      // user.updated: only refresh fields Clerk can change.
      await supabase
        .from('profiles')
        .update({
          photo_url: u.image_url ?? null,
          email: primaryEmail,
        })
        .eq('id', u.id);
    }

    // Mirror each verified external account into verifications. Email is
    // intentionally excluded — see lib/clerk-sync.ts for rationale.
    const verifications: Array<{
      user_id: string;
      channel: string;
      handle: string;
      verified_at: string;
      proof: Record<string, unknown>;
    }> = [];

    for (const acc of u.external_accounts ?? []) {
      if (acc.verification?.status !== 'verified') continue;
      const channel = providerToChannel(acc.provider);
      if (!channel) continue;
      verifications.push({
        user_id: u.id,
        channel,
        handle: acc.username ?? acc.email_address ?? '',
        verified_at: new Date().toISOString(),
        proof: { via: 'clerk', provider: acc.provider },
      });
    }

    if (verifications.length > 0) {
      const { error } = await supabase
        .from('verifications')
        .upsert(verifications, { onConflict: 'user_id,channel' });
      if (error) {
        return NextResponse.json(
          { error: `verifications upsert: ${error.message}` },
          { status: 500 },
        );
      }
    }
  }

  // session.created and everything else: ignored for now.
  return NextResponse.json({ ok: true });
}
