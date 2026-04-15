/**
 * Sentry initialisation — browser runtime. Loaded by Next.js at startup.
 *
 * The DSN is read from `NEXT_PUBLIC_SENTRY_DSN`, not `SENTRY_DSN`, because
 * this file is bundled to the client and only NEXT_PUBLIC_ vars are exposed
 * there. If you only set SENTRY_DSN (server-only), client errors won't be
 * captured — usually fine for a pre-launch phase where server errors are
 * what you care about most.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Session replay disabled by default — costs money, and we don't have a
    // privacy policy covering it yet. Enable with Sentry.replayIntegration()
    // if you want it later.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
