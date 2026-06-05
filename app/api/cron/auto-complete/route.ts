import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { matches, trips } from '@/lib/db/schema';
import { requireCronSecret } from '@/lib/auth-guard';

/**
 * Auto-complete matches 48h after the travel date if neither party disputed.
 * Intended to be hit on a daily Vercel Cron. Auth enforced by
 * `requireCronSecret` — fails CLOSED on missing secret (see
 * bugs/05-cron-auth-fails-open.md). See Product Spec §6.1 — pg_cron is
 * also an option, but this lives next to the app for easy iteration in v1.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 3600 * 1000).toISOString().slice(0, 10);

  try {
    const updated = await withService(async (tx) => {
      // Find active matches whose linked trip.travel_date is older than
      // cutoff. Drizzle does the inner join via .innerJoin().
      const candidates = await tx
        .select({ id: matches.id })
        .from(matches)
        .innerJoin(trips, eq(trips.id, matches.tripId))
        .where(and(eq(matches.status, 'active'), lte(trips.travelDate, cutoff)));

      if (candidates.length === 0) return 0;
      const ids = candidates.map((c) => c.id);
      await tx
        .update(matches)
        .set({ posterMarkedComplete: true, requesterMarkedComplete: true })
        .where(inArray(matches.id, ids));
      return ids.length;
    });

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
