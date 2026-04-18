import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Per-user, per-endpoint fixed-window rate limiter.
 *
 * Calls the `check_rate_limit` Postgres function (added in 0018), which
 * atomically increments a minute-bucket counter and returns false once
 * the limit is exceeded. Pair with a `requireUserId` guard so anon
 * calls don't even reach here.
 *
 * Usage:
 *   const { userId } = await auth();
 *   if (!userId) return NextResponse.json({...}, { status: 401 });
 *
 *   const supabase = await createSupabaseServerClient();
 *   const ok = await checkRateLimit(supabase, 'flights/lookup', 20);
 *   if (!ok) return NextResponse.json({...}, { status: 429 });
 */
export async function checkRateLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  endpoint: string,
  limitPerMinute: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_endpoint: endpoint,
    p_limit: limitPerMinute,
  });

  if (error) {
    // Fail OPEN on rpc errors — a misconfigured migration shouldn't lock
    // everyone out of endpoints that use this. Log so a flood of errors
    // surfaces in Sentry.
    console.error(`[rate-limit] check failed for ${endpoint}:`, error.message);
    return true;
  }

  return data === true;
}
