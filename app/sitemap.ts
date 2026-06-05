import type { MetadataRoute } from 'next';
import { desc, eq } from 'drizzle-orm';
import { withService } from '@/lib/db';
import { publicProfiles, publicTrips } from '@/lib/db/schema';
import { siteUrl } from '@/lib/site';

/**
 * /sitemap.xml — auto-generated. Two halves:
 *
 *   1. Static marketing routes (/, /about, /faq, /search). These have
 *      stable URLs and sensible change frequencies — search is hit
 *      frequently as new trips post; about/faq drift slowly.
 *
 *   2. Dynamic public surfaces (/trip/[id], /profile/[id]) pulled via
 *      withService (RLS bypass) so the sitemap isn't subject to
 *      per-request auth. Capped at 5_000 entries each to stay under
 *      Google's 50_000-URL/50MB limit with room to grow; pagination via
 *      /sitemap-N.xml indexes can come later if needed.
 *
 * The service path is OK here because the sitemap only exposes IDs that
 * are already publicly readable via public_trips / public_profiles — we're
 * just listing the same set without auth overhead per row.
 *
 * Cached at the route level by Next's default ISR. To bust manually,
 * `revalidatePath('/sitemap.xml')` from the relevant write paths if the
 * crawl freshness becomes load-bearing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${origin}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ];

  // Best-effort dynamic entries. Sitemap should still respond if the DB
  // is unreachable — we'd rather serve a partial sitemap than 500.
  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const { trips, profiles } = await withService(async (tx) => {
      // Sequential inside one tx — postgres.js serializes statements per
      // connection, so Promise.all on the same tx doesn't parallelize.
      const trips = await tx
        .select({ id: publicTrips.id, createdAt: publicTrips.createdAt })
        .from(publicTrips)
        .where(eq(publicTrips.status, 'open'))
        .orderBy(desc(publicTrips.createdAt))
        .limit(5_000);
      const profiles = await tx
        .select({ id: publicProfiles.id, updatedAt: publicProfiles.updatedAt })
        .from(publicProfiles)
        .orderBy(desc(publicProfiles.updatedAt))
        .limit(5_000);
      return { trips, profiles };
    });

    dynamicRoutes = [
      ...trips.map((t) => ({
        url: `${origin}/trip/${t.id}`,
        lastModified: t.createdAt ? new Date(t.createdAt) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
      ...profiles.map((p) => ({
        url: `${origin}/profile/${p.id}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.4,
      })),
    ];
  } catch {
    // Swallow — partial sitemap > broken sitemap.
  }

  return [...staticRoutes, ...dynamicRoutes];
}
