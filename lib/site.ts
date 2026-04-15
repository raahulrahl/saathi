/**
 * Canonical site origin. Single helper so every SEO surface (sitemap,
 * robots, opengraph, layout metadata) reads from one source instead of
 * scattering env-var fallbacks across files.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — set in prod to the canonical origin
 *   2. https://getsaathi.com — production fallback if env is somehow
 *      missing (better to crawl prod than to send Google to localhost)
 *
 * Returns the origin without a trailing slash so callers can append
 * paths cleanly: `${siteUrl()}/about`.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getsaathi.com';
  return raw.replace(/\/+$/, '');
}
