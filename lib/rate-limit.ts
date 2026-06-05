import 'server-only';

import { sql } from 'drizzle-orm';
import { withUser } from '@/lib/db';

/**
 * Per-user, per-endpoint fixed-window rate limiter.
 *
 * Calls the `check_rate_limit` Postgres function (added in 0018), which
 * atomically increments a minute-bucket counter and returns false once
 * the limit is exceeded.
 *
 * The function is SECURITY DEFINER but reads `public.clerk_user_id()`
 * from the request.jwt.claims GUC — meaning it MUST run inside a
 * `withUser(userId, …)` transaction (role authenticated + claims set).
 * Calling without identity raises 'check_rate_limit: not authenticated'.
 *
 * Usage:
 *   const { userId } = await auth();
 *   if (!userId) return NextResponse.json({…}, { status: 401 });
 *   const ok = await checkRateLimit(userId, 'flights/lookup', 20);
 *   if (!ok) return NextResponse.json({…}, { status: 429 });
 */
export async function checkRateLimit(
  clerkUserId: string,
  endpoint: string,
  limitPerMinute: number,
): Promise<boolean> {
  try {
    const rows = await withUser(clerkUserId, (tx) =>
      tx.execute<{ check_rate_limit: boolean }>(
        sql`select public.check_rate_limit(${endpoint}, ${limitPerMinute}) as check_rate_limit`,
      ),
    );
    return rows[0]?.check_rate_limit === true;
  } catch (err) {
    // Fail OPEN on rpc errors — a misconfigured migration shouldn't lock
    // everyone out of endpoints that use this. Log so a flood of errors
    // surfaces in Sentry.
    console.error(`[rate-limit] check failed for ${endpoint}:`, (err as Error).message);
    return true;
  }
}
