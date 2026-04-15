import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { syncClerkUserToSupabase } from '@/lib/clerk-sync';

/**
 * Manual trigger for the Clerk → Supabase self-heal. Called from the
 * onboarding page when the user hits "this account is already linked"
 * from Clerk — the link clearly exists on Clerk's side, we just haven't
 * mirrored it into `verifications` yet. Hitting this endpoint + reloading
 * the page fixes the mismatch without forcing a full sign-out.
 *
 * Returns 200 on success so the client can refresh; 401 if the caller
 * isn't signed in; 500 if the sync throws (most commonly: service role
 * key misconfigured, which blocks the webhook path too — worth fixing).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }
  try {
    await syncClerkUserToSupabase(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
