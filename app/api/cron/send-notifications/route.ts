import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { dispatchPendingNotifications } from '@/lib/notifications/dispatch';

/**
 * Drain the notification queue. Runs every minute on Vercel Cron.
 *
 * Loops `dispatchPendingNotifications` up to a small max-iterations
 * budget so a deep backlog drains across multiple invocations rather
 * than timing out in one 60s run. Stops early when a cycle returns
 * zero claimed rows (queue is empty).
 *
 * Auth: fails closed via `requireCronSecret` — missing CRON_SECRET
 * returns 500, wrong bearer returns 401. See bug 05.
 */

// Cap wall-clock work. Vercel Hobby functions time out at 10s, Pro at
// 60s — this keeps us under both while still draining a reasonable
// backlog in one invocation.
const MAX_ITERATIONS = 20;
const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  let claimed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await dispatchPendingNotifications(BATCH_SIZE);
    claimed += result.claimed;
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
    deferred += result.deferred;
    if (result.claimed === 0) break;
  }

  return NextResponse.json({ ok: true, claimed, sent, skipped, failed, deferred });
}
