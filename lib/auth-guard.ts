import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

/**
 * Server-side auth guard. Returns the signed-in Clerk user id, or
 * redirects to the sign-in page with the current location encoded as
 * `next=` so the user lands back where they were after signing in.
 *
 * Replaces the copy-pasted
 *     const { userId } = await auth();
 *     if (!userId) redirect('/auth/sign-in?next=/...');
 * pattern that appeared six times across page components. Keeps the
 * redirect target consistent (always `?next=`, never `?redirect_url=` —
 * which we had both of before this helper).
 *
 * Usage: at the top of a server component or server action,
 *     const userId = await requireUserId('/match/abc');
 *
 * The `returnTo` argument is the path to come back to after sign-in —
 * usually the page's own pathname. Passing an empty string falls back
 * to /dashboard.
 */
export async function requireUserId(returnTo: string): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    const target = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard';
    redirect(`/auth/sign-in?next=${encodeURIComponent(target)}`);
  }
  return userId;
}

/**
 * Non-redirecting variant for use inside server actions and API routes
 * that want to return a clean 401 JSON response instead of doing a
 * server-side redirect. Returns null when the caller isn't signed in.
 */
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * Gate for Vercel Cron routes. Fails CLOSED — if CRON_SECRET isn't
 * configured, returns 500 rather than silently letting every request
 * through. Return value is an error response to send back, or `null`
 * when the request is authorised and the caller should proceed.
 *
 * Usage:
 *     const denied = requireCronSecret(request);
 *     if (denied) return denied;
 *
 * See bugs/05-cron-auth-fails-open.md for the underlying incident this
 * helper exists to prevent. Returns 500 (not 401) on missing secret so
 * a preview deploy without CRON_SECRET fails loudly rather than looking
 * authless-but-successful.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'cron secret not configured' }, { status: 500 });
  }
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  return null;
}
