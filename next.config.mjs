import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the trace root so Next doesn't pick up the parent checkout's lockfile.
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      // Supabase Storage public buckets
      { protocol: 'https', hostname: '**.supabase.co' },
      // OAuth avatar sources
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'media.licdn.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
};

// Sentry webpack plugin — uploads source maps on production builds and tunnels
// monitoring requests through /monitoring to bypass ad blockers. Plugin no-ops
// when SENTRY_AUTH_TOKEN is missing (dev + CI without the secret), so local
// builds don't need Sentry credentials. `withSentryConfig` is also safe to
// keep even if SENTRY_DSN is unset — the runtime init files already guard on
// DSN presence.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn('[sentry] source map upload skipped:', err.message);
  },
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
});
