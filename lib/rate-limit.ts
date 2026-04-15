/**
 * Rate limiter backed by Upstash Redis + @upstash/ratelimit.
 *
 * Why Upstash specifically: it's HTTP-based (no persistent connection), so
 * it works on Vercel serverless / edge without running into the cold-start
 * connection-pool problems that hit Postgres/Redis TCP clients. And the
 * free tier covers everything we'd plausibly need before we have real scale.
 *
 * Behaviour: if UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN aren't set,
 * `checkRateLimit()` returns { success: true } unconditionally. That means
 * local dev doesn't need Upstash at all, and if we ever ship to a preview
 * environment without the env vars wired, the site works (just without
 * rate protection). The SETUP.md calls this out.
 *
 * Identifier pattern: prefer the authenticated user id, fall back to IP.
 * For WhatsApp verify specifically, we also want to rate-limit per phone
 * number — so the public helpers take a composite key.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Limiter = Ratelimit;

let cached: Limiter | null | undefined;

function getLimiter(): Limiter | null {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }

  cached = new Ratelimit({
    redis: new Redis({ url, token }),
    // Sliding window: 5 requests per minute per identifier. Picked to cover
    // "one user mistyping the OTP a few times" without allowing a script to
    // burn through Twilio balance.
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'saathi_rl',
  });
  return cached;
}

export interface RateLimitResult {
  success: boolean;
  /** Remaining requests in the current window. `Infinity` when no limiter. */
  remaining: number;
  /** Unix ms when the window resets. `0` when no limiter. */
  reset: number;
  /** Total limit in the window. `Infinity` when no limiter. */
  limit: number;
}

/**
 * Check + consume one token for `identifier`. The identifier should already
 * encode the scope (e.g. `verify-start:user_123` or `verify-start:ip:1.2.3.4`)
 * so that different routes don't share buckets.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = getLimiter();
  if (!limiter) {
    return { success: true, remaining: Infinity, reset: 0, limit: Infinity };
  }
  const res = await limiter.limit(identifier);
  return {
    success: res.success,
    remaining: res.remaining,
    reset: res.reset,
    limit: res.limit,
  };
}

/**
 * Pull a best-effort client IP from request headers. Vercel puts the real
 * client IP in `x-forwarded-for` (leftmost entry). Fallbacks cover other
 * hosts and a final "unknown" sentinel so the limit key is always defined.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return (
    headers.get('x-real-ip') ??
    headers.get('cf-connecting-ip') ??
    headers.get('fly-client-ip') ??
    'unknown'
  );
}
