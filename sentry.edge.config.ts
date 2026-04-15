/**
 * Sentry initialisation — Edge runtime (middleware, edge route handlers).
 * Loaded from `instrumentation.ts`.
 *
 * Kept minimal — the edge runtime doesn't support the full Node integration
 * set, and our middleware is just Clerk auth gating which rarely throws.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
