import type { MetadataRoute } from 'next';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';

/**
 * /sitemap.xml — auto-generated. Two halves:
 *
 *   1. Static marketing routes (/, /about, /faq, /search). These have
 *      stable URLs and sensible change frequencies — search is hit
 *      frequently as new trips post; about/faq drift slowly.
 *
 *   2. Dynamic public surfaces (/trip/[id], /profile/[id]) pulled from
 *      Supabase via the service-role client (RLS bypass) so the sitemap
 *      isn't subject to per-request auth. Capped at 5_000 entries each
 *      to stay under Google's 50_000-URL/50MB limit with room to grow;
 *      pagination via /sitemap-N.xml indexes can come later if needed.
 *
 * The service client is OK to use here because the sitemap only exposes
 * IDs that are already publicly readable via public_trips / public_profiles
 * — we're just listing the same set without auth overhead per row.
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

  // Best-effort dynamic entries. Sitemap should still respond if Supabase
  // is unreachable — we'd rather serve a partial sitemap than 500.
  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabaseServiceClient();

    const [{ data: trips }, { data: profiles }] = await Promise.all([
      supabase
        .from('public_trips')
        .select('id, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5_000),
      supabase
        .from('public_profiles')
        .select('id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5_000),
    ]);

    dynamicRoutes = [
      ...(trips ?? []).map((t) => ({
        url: `${origin}/trip/${t.id}`,
        lastModified: t.created_at ? new Date(t.created_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
      ...(profiles ?? []).map((p) => ({
        url: `${origin}/profile/${p.id}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.4,
      })),
    ];
  } catch {
    // Swallow — partial sitemap > broken sitemap.
  }

  return [...staticRoutes, ...dynamicRoutes];
}
