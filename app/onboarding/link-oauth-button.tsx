'use client';

import { useState } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

type LinkableProvider = 'linkedin' | 'twitter';

const CLERK_STRATEGY: Record<LinkableProvider, 'oauth_linkedin_oidc' | 'oauth_x'> = {
  linkedin: 'oauth_linkedin_oidc',
  twitter: 'oauth_x',
};

const LABEL: Record<LinkableProvider, string> = {
  linkedin: 'LinkedIn',
  twitter: 'X',
};

/**
 * Adds an external account to the current Clerk user. Clerk opens its own
 * OAuth window; on return the Clerk webhook fires `user.updated`, which
 * mirrors the new identity into our `verifications` table (see
 * /api/clerk-webhook).
 *
 * Errors that fell through `createExternalAccount()` used to be silently
 * swallowed — the button would re-enable but the user had no idea what
 * happened. Clerk now throws a "reverification_required" error for
 * sensitive actions on older sessions, and without surfacing it the whole
 * flow was invisible. Errors are now caught and rendered inline, with a
 * one-click "sign out and back in" fallback for the reverification case
 * since that's the fastest way to continue without dashboard config.
 */
type LinkState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'syncing' }
  | { kind: 'already-linked' }
  | { kind: 'error'; message: string; needsReauth: boolean };

export function LinkOAuthButton({ provider }: { provider: LinkableProvider }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [state, setState] = useState<LinkState>({ kind: 'idle' });

  async function onClick() {
    if (!isLoaded || !user) return;
    setState({ kind: 'pending' });
    try {
      await user.createExternalAccount({
        strategy: CLERK_STRATEGY[provider],
        redirectUrl: window.location.href,
      });
    } catch (err) {
      const parsed = parseClerkError(err);
      // "already connected" on Clerk's side means the link exists — our DB
      // just hasn't mirrored it yet. Ping the server-side sync, then reload
      // so the page re-reads `verifications` and flips this card to
      // "Verified" without the user having to think.
      if (parsed.kind === 'already-linked') {
        setState({ kind: 'syncing' });
        try {
          await fetch('/api/sync-clerk', { method: 'POST' });
        } catch {
          /* non-fatal — reload still picks up Clerk state on next render */
        }
        window.location.reload();
        return;
      }
      setState(parsed);
    }
  }

  const isBusy = state.kind === 'pending' || state.kind === 'syncing' || !isLoaded;

  return (
    <div className="space-y-1.5">
      <Button variant="outline" size="sm" onClick={onClick} disabled={isBusy} className="w-full">
        {state.kind === 'syncing'
          ? 'Syncing…'
          : state.kind === 'pending'
            ? 'Redirecting…'
            : `Link ${LABEL[provider]}`}
      </Button>
      {state.kind === 'error' ? (
        <div className="rounded-md border border-pomegranate-400/40 bg-pomegranate-400/10 p-2 text-xs text-warm-charcoal">
          <p>{state.message}</p>
          {state.needsReauth ? (
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: '/auth/sign-in?redirect_url=/onboarding' })}
              className="mt-1 font-semibold text-marigold-700 underline-offset-4 hover:underline"
            >
              Sign out and back in →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ParsedError =
  | { kind: 'already-linked' }
  | { kind: 'error'; message: string; needsReauth: boolean };

function parseClerkError(err: unknown): ParsedError {
  if (err && typeof err === 'object' && 'errors' in err) {
    const first = (
      err as { errors: Array<{ code?: string; message?: string; longMessage?: string }> }
    ).errors?.[0];
    const code = first?.code ?? '';
    const msg = (first?.longMessage ?? first?.message ?? '').toLowerCase();

    // Already connected — Clerk-side link exists, we just need to resync.
    if (
      code === 'external_account_exists' ||
      code === 'oauth_account_already_connected' ||
      msg.includes('already connected') ||
      msg.includes('already linked')
    ) {
      return { kind: 'already-linked' };
    }

    // Reverification / step-up — fresh sign-in needed.
    if (
      code === 'reverification_required' ||
      code === 'session_exists' ||
      msg.includes('additional verification')
    ) {
      return {
        kind: 'error',
        message:
          'Clerk wants a fresh sign-in before linking another account (a security policy called "step-up auth"). Easiest: sign out and back in, then try again.',
        needsReauth: true,
      };
    }

    return {
      kind: 'error',
      message: first?.longMessage ?? first?.message ?? 'Couldn’t link account.',
      needsReauth: false,
    };
  }
  if (err instanceof Error) {
    return { kind: 'error', message: err.message, needsReauth: false };
  }
  return { kind: 'error', message: 'Couldn’t link account.', needsReauth: false };
}
