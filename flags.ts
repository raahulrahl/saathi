import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { postHogAdapter } from '@flags-sdk/posthog';
import { dedupe, flag } from 'flags/next';
import type { Identify } from 'flags';

/**
 * Feature-flag entry point. PostHog is the source of truth — flags created
 * in PostHog's UI flow through this file and become typed `flag()` calls
 * on the server. Toggle a flag in PostHog and a redeploy isn't needed:
 * the next request picks up the new value.
 *
 * Why server-side flags?
 * - Variant decisions live next to data (no client-side flicker, no FOUC).
 * - Server actions can branch behaviour without leaking unfinished UI.
 * - Bots and signed-out viewers get a stable default (no PostHog round-trip
 *   for crawl traffic).
 *
 * Identity model: every flag evaluation needs a `distinctId` so PostHog
 * can bucket users consistently. We use the Clerk user id when available
 * and fall back to "anonymous" for signed-out traffic. PostHog does its
 * own anonymous-user tracking on the client; the server-side default is
 * a deliberately stable identifier so signed-out users see the same
 * variant on every request (avoids cohort drift mid-session).
 *
 * `dedupe()` ensures we only call `auth()` once per request even when
 * many flags evaluate in the same render pass.
 */
export const identify = dedupe(async () => {
  const { userId } = await auth();
  return {
    distinctId: userId ?? 'anonymous',
  };
}) satisfies Identify<{ distinctId: string }>;

/**
 * Example flag — leave this as the canonical scaffold so future flags
 * have a known shape to copy. Add a flag in PostHog with key
 * `example-flag` to flip it on; otherwise it returns the adapter's
 * default (false).
 *
 * Remove or rename once a real flag lands.
 */
export const exampleFlag = flag({
  key: 'example-flag',
  adapter: postHogAdapter.isFeatureEnabled(),
  identify,
});
