'use client';

/**
 * Next.js App Router global error boundary. Catches errors in the root
 * layout (which app/error.tsx cannot). Reports to Sentry and shows a
 * minimal fallback — no dependency on our own components or fonts, since
 * those may themselves be the cause of the error.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: '48px 24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#faf9f7',
          color: '#2e241c',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 12 }}>
            Something went sideways.
          </h1>
          <p style={{ color: '#4a3d32', lineHeight: 1.6, marginBottom: 24 }}>
            We&rsquo;ve logged the error and we&rsquo;ll look at it. In the meantime, try refreshing
            — or head back to the start.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              global-error replaces the root layout when it triggers, so
              next/link (which depends on the router provider from the layout)
              isn't reliable here. A plain <a> forces a full page reload,
              which is what we want anyway to recover from broken app state. */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 999,
              background: '#2e241c',
              color: '#faf9f7',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Back to Saathi
          </a>
        </div>
      </body>
    </html>
  );
}
