'use client';

import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import type { Arc, COBEOptions, Globe } from 'cobe';
import { getCoords } from '@/lib/airport-coords';

interface FlightGlobeProps {
  /**
   * One ordered list of IATA codes, e.g. ["CCU", "DOH", "AMS"].
   * Used by the post / trip flows where a single trip is being shown.
   */
  route?: string[] | undefined;
  /**
   * Multiple distinct routes. Each inner array is its own multi-leg trip.
   * Used by the home page world view to render arcs for many trips at once.
   * If both `route` and `routes` are passed, they're concatenated.
   */
  routes?: string[][] | undefined;
  /** Auto-rotate slowly. Off by default — felt distracting in the post flow. */
  autoRotate?: boolean | undefined;
  className?: string | undefined;
}

// cobe uses [r, g, b] in 0–1 range
const MATCHA_600: [number, number, number] = [0.027, 0.541, 0.322]; // #078a52
const MATCHA_ARC: [number, number, number] = [0.518, 0.906, 0.647]; // #84e7a5 (bright on cream)

function lngToPhi(lng: number): number {
  return (-lng * Math.PI) / 180;
}

function midLng(lng1: number, lng2: number): number {
  let diff = lng2 - lng1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return lng1 + diff / 2;
}

export function FlightGlobe({ route, routes, autoRotate = false, className }: FlightGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const rafRef = useRef<number>(0);
  const phi = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const dragDelta = useRef(0);

  // Build the canonical route list — accept either prop, concatenate if both.
  const allRoutes: string[][] = [...(route && route.length > 0 ? [route] : []), ...(routes ?? [])];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resolve every leg of every route into coordinates. Drop unknown IATAs.
    const resolvedRoutes = allRoutes
      .map((r) =>
        r.map((iata) => getCoords(iata)).filter((c): c is [number, number] => c !== undefined),
      )
      .filter((coords) => coords.length >= 2);

    // Center globe on the midpoint of the FIRST route — gives a consistent
    // view when only one route is shown. Multi-route world view ends up
    // rotating anyway via auto-rotate.
    const firstRoute = resolvedRoutes[0];
    if (firstRoute && firstRoute.length >= 2) {
      const fromLng = firstRoute[0]![1];
      const toLng = firstRoute[firstRoute.length - 1]![1];
      phi.current = lngToPhi(midLng(fromLng, toLng));
    }

    // Build arcs across all routes (cobe v2: from/to as [lat, lng])
    const arcs: Arc[] = [];
    for (const coords of resolvedRoutes) {
      for (let i = 0; i < coords.length - 1; i++) {
        const from = coords[i]!;
        const to = coords[i + 1]!;
        arcs.push({
          from: [from[0], from[1]],
          to: [to[0], to[1]],
          color: MATCHA_ARC,
        });
      }
    }

    // Markers at every airport across all routes — dedupe by lat,lng
    const markerSeen = new Set<string>();
    const markers: COBEOptions['markers'] = [];
    for (const coords of resolvedRoutes) {
      for (const [lat, lng] of coords) {
        const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
        if (markerSeen.has(key)) continue;
        markerSeen.add(key);
        markers.push({ location: [lat, lng], size: 0.09 });
      }
    }

    const opts: COBEOptions = {
      devicePixelRatio: Math.min(window.devicePixelRatio, 2),
      width: canvas.offsetWidth * 2,
      height: canvas.offsetHeight * 2,
      phi: phi.current,
      theta: 0.3,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 20000,
      mapBrightness: 6,
      baseColor: [0.98, 0.97, 0.96],
      markerColor: MATCHA_600,
      glowColor: [0.94, 0.93, 0.91],
      markers,
      arcs,
      arcColor: MATCHA_ARC,
      arcWidth: 2.6,
      arcHeight: 0.45,
    };

    globeRef.current?.destroy();
    globeRef.current = createGlobe(canvas, opts);

    // Render loop. By default the globe is static (only moves when dragged).
    // When `autoRotate` is true, slowly drift phi — used by the home page
    // world view where motion makes the multiple arcs feel alive.
    let lastTs = 0;
    function animate(ts: number) {
      if (autoRotate && !dragging.current) {
        const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
        phi.current += dt * 0.08; // slow drift
      }
      lastTs = ts;
      globeRef.current?.update({ phi: phi.current + dragDelta.current });
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      globeRef.current?.destroy();
      globeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoutes.map((r) => r.join(',')).join('|'), autoRotate]);

  return (
    <div
      className={className}
      style={{ aspectRatio: '1 / 1', userSelect: 'none', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        onPointerDown={(e) => {
          dragging.current = true;
          lastX.current = e.clientX;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          (e.target as HTMLCanvasElement).style.cursor = 'grabbing';
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const delta = e.clientX - lastX.current;
          dragDelta.current += delta / 200;
          lastX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          phi.current += dragDelta.current;
          dragDelta.current = 0;
          (e.target as HTMLCanvasElement).style.cursor = 'grab';
        }}
        onPointerCancel={() => {
          dragging.current = false;
          phi.current += dragDelta.current;
          dragDelta.current = 0;
        }}
      />
    </div>
  );
}
