/**
 * Next.js instrumentation hook. Runs once at server startup (Node runtime)
 * and at edge cold start. We use it solely to load the right Sentry config
 * for the active runtime.
 *
 * The client config is loaded separately via the standard
 * `sentry.client.config.ts` convention — Next.js picks that up automatically.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
