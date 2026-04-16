'use client';

import dynamic from 'next/dynamic';

/**
 * Thin wrapper for the hero particle scene. Server Components can't
 * call next/dynamic, so the home page renders this and the heavy
 * Three.js import only happens on the client after first paint.
 */
const HeroParticles = dynamic(
  () => import('@/components/hero-particles').then((m) => m.HeroParticles),
  { ssr: false },
);

export function HeroParticlesWrapper() {
  return <HeroParticles />;
}
