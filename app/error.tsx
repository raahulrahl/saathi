'use client';

/**
 * Next.js App Router error boundary for route segments below the root layout.
 * Wrapped in the app's chrome (header, footer) via the layout above it.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-5 py-16 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
        Something went sideways.
      </h1>
      <p className="max-w-md text-balance text-base leading-relaxed text-warm-charcoal">
        We&rsquo;ve logged the error and we&rsquo;ll look at it. You can try again, or head back to
        the start.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="clay-hover inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-background"
        >
          Try again
        </button>
        <Link
          href="/"
          className="clay-hover inline-flex h-12 items-center justify-center rounded-full border border-oat bg-white px-6 text-sm font-semibold text-foreground"
        >
          Back to Saathi
        </Link>
      </div>
      {error.digest ? <p className="text-xs text-warm-silver">Reference: {error.digest}</p> : null}
    </div>
  );
}
