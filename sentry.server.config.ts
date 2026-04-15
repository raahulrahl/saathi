/**
 * Sentry initialisation — Node server runtime (server components, route
 * handlers, server actions). Loaded from `instrumentation.ts` via the
 * Next.js register hook.
 *
 * No-ops cleanly when SENTRY_DSN is unset, so local dev and preview
 * deployments without the secret wired just skip error reporting.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // 10% traces sample rate in prod. Cheap insurance against a bill spike
    // if a hot endpoint is misbehaving; raise for investigation windows.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Don't send PII by default. The identify() call in the client config
    // attaches the Clerk user id explicitly when available.
    sendDefaultPii: false,
  });
}
