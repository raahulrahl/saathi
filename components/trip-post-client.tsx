'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import { PostWizard, type FlightLookupResult } from '@/app/post/post-wizard';
import type { TripInput } from '@/app/post/actions';
import { AIRPORTS } from '@/lib/iata';
import { FlightTimeline } from '@/components/flight-timeline';

/**
 * Shared client wrapper for both "offer" and "request" posting flows.
 *
 * Both flows render the same three things side-by-side:
 *   - PostWizard (the form — handles its own kind-specific fields)
 *   - FlightGlobe (sticky sidebar)
 *   - FlightTimeline (appears once a flight number resolves)
 *
 * Only PostWizard's `kind` prop differentiates them — the wizard itself
 * already branches on kind for copy, validation, and the parent-details
 * section. Keeping both flows in one client file means any UX
 * improvement (globe look, timeline layout, sidebar behaviour) ships
 * to both pages at once, with no duplication.
 */

// Dynamic import so WebGL never blocks the initial page render.
const FlightGlobe = dynamic(() => import('@/components/flight-globe').then((m) => m.FlightGlobe), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-square items-center justify-center">
      <span className="text-sm text-muted-foreground">Loading globe…</span>
    </div>
  ),
});

interface TripPostClientProps {
  kind: 'offer' | 'request';
  profileLanguages: string[];
  defaults?: Partial<TripInput> | undefined;
}

// IATA → city lookup, built once at module load
const CITY_BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a.city]));

export function TripPostClient({ kind, profileLanguages, defaults }: TripPostClientProps) {
  const [route, setRoute] = useState<string[]>(
    (defaults?.route ?? []).filter((x) => x.length === 3),
  );
  const [flightDetails, setFlightDetails] = useState<Record<number, FlightLookupResult>>({});

  const handleRouteChange = useCallback((r: string[]) => {
    setRoute(r.filter((x) => x.length === 3));
  }, []);

  const handleFlightLookup = useCallback((legIndex: number, detail: FlightLookupResult) => {
    setFlightDetails((prev) => ({ ...prev, [legIndex]: detail }));
  }, []);

  const hasRoute = route.length >= 2;
  const legCount = Math.max(route.length - 1, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      {/* Form column */}
      <div className="rounded-3xl border border-oat bg-card p-6 shadow-clay md:p-8">
        <PostWizard
          kind={kind}
          profileLanguages={profileLanguages}
          defaults={defaults}
          onRouteChange={handleRouteChange}
          onFlightLookup={handleFlightLookup}
        />
      </div>

      {/* Sticky sidebar: globe + route summary + timeline */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-3">
          <div className="overflow-hidden rounded-3xl border border-oat bg-gradient-to-b from-cream to-oat-light/30 p-3 shadow-clay">
            <FlightGlobe route={route} className="mx-auto w-full max-w-[300px]" />
            <p className="mt-1 text-center text-xs text-warm-charcoal">
              {hasRoute ? '↔ Drag to rotate your route' : 'Your route appears here as you type'}
            </p>
          </div>

          {hasRoute && (
            <div className="rounded-2xl border border-oat bg-card px-4 py-3">
              <div className="flex items-center justify-center gap-1.5 font-mono text-base font-semibold">
                {route.map((code, i) => (
                  <span key={`${code}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <span>{code}</span>
                  </span>
                ))}
              </div>
              <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                {route.map((code, i) => (
                  <li key={`${code}-${i}`} className="flex items-center gap-2">
                    <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-matcha-300/40 font-mono text-[9px] text-matcha-800">
                      {i + 1}
                    </span>
                    <span className="font-mono">{code}</span>
                    <span>{CITY_BY_IATA.get(code) ?? ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <FlightTimeline details={flightDetails} legCount={legCount} />
        </div>
      </aside>

      {/* Mobile: show globe + timeline below the form */}
      {hasRoute && (
        <div className="space-y-3 lg:hidden">
          <div className="rounded-3xl border border-oat bg-gradient-to-b from-cream to-oat-light/30 p-3">
            <FlightGlobe route={route} className="mx-auto w-full max-w-[260px]" />
            <p className="mt-2 text-center font-mono text-base font-semibold">
              {route.join(' → ')}
            </p>
          </div>
          <FlightTimeline details={flightDetails} legCount={legCount} />
        </div>
      )}
    </div>
  );
}
