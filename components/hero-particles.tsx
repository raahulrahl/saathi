'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Atmospheric particle field rendered behind the hero headline.
 *
 * Think: gentle dust motes in warm light, or stars visible through a
 * sunlit window. You notice it adds warmth, but you can't point to any
 * single particle.
 *
 * - 400 tiny dots in warm-silver, ~10% tinted marigold
 * - Slow brownian drift (~0.2 px/frame)
 * - Subtle mouse parallax (2–3px opposite to cursor) for depth
 * - Transparent canvas over the cream background
 * - prefers-reduced-motion: freezes after one frame
 * - Mobile: drift only, no parallax
 */

// ── Palette ─────────────────────────────────────────────────────────
const WARM_SILVER = new THREE.Color(0x9f9b93);
const MARIGOLD = new THREE.Color(0xf59e0b);

const PARTICLE_COUNT = 400;
const DRIFT_SPEED = 0.00015; // brownian per frame
const PARALLAX_STRENGTH = 0.002; // how much mouse moves the scene

export function HeroParticles() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // ── Scene ────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 20;

    const renderer = new THREE.WebGLRenderer({
      antialias: false, // particles don't need AA
      alpha: true, // transparent — cream shows through
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // fully transparent
    container.appendChild(renderer.domElement);

    // ── Particles ────────────────────────────────────────────────
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colours = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3); // brownian drift

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Spread across a wide, shallow box
      positions[i3] = (Math.random() - 0.5) * 40; // x: -20 to 20
      positions[i3 + 1] = (Math.random() - 0.5) * 20; // y: -10 to 10
      positions[i3 + 2] = (Math.random() - 0.5) * 10; // z: -5 to 5

      // Initial drift direction (will change each frame via brownian)
      velocities[i3] = (Math.random() - 0.5) * DRIFT_SPEED;
      velocities[i3 + 1] = (Math.random() - 0.5) * DRIFT_SPEED;
      velocities[i3 + 2] = (Math.random() - 0.5) * DRIFT_SPEED * 0.3;

      // Colour: 90% warm-silver, 10% marigold
      const col = Math.random() < 0.1 ? MARIGOLD : WARM_SILVER;
      colours[i3] = col.r;
      colours[i3 + 1] = col.g;
      colours[i3 + 2] = col.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    const material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Mouse tracking ───────────────────────────────────────────
    const mouse = { x: 0, y: 0 }; // normalised -1 to 1
    function onMouseMove(e: MouseEvent) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    // Only add mouse listener on desktop (no touch parallax)
    const isDesktop = window.matchMedia('(pointer: fine)').matches;
    if (isDesktop && !reducedMotion) {
      window.addEventListener('mousemove', onMouseMove, { passive: true });
    }

    // ── Animation ────────────────────────────────────────────────
    let rafId = 0;
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;

    function animate() {
      rafId = requestAnimationFrame(animate);

      // Brownian drift — nudge each particle's velocity slightly
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;

        // Random walk on velocity
        velocities[i3] += (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
        velocities[i3 + 1] += (Math.random() - 0.5) * DRIFT_SPEED * 0.3;

        // Dampen to prevent runaway
        velocities[i3] *= 0.99;
        velocities[i3 + 1] *= 0.99;

        // Apply
        positions[i3] += velocities[i3];
        positions[i3 + 1] += velocities[i3 + 1];
        positions[i3 + 2] += velocities[i3 + 2];

        // Wrap around bounds (seamless)
        if (positions[i3] > 20) positions[i3] = -20;
        if (positions[i3] < -20) positions[i3] = 20;
        if (positions[i3 + 1] > 10) positions[i3 + 1] = -10;
        if (positions[i3 + 1] < -10) positions[i3 + 1] = 10;
      }
      posAttr.needsUpdate = true;

      // Mouse parallax (shift the whole point cloud opposite to cursor)
      if (isDesktop) {
        points.position.x += (-mouse.x * PARALLAX_STRENGTH * 15 - points.position.x) * 0.05;
        points.position.y += (-mouse.y * PARALLAX_STRENGTH * 10 - points.position.y) * 0.05;
      }

      renderer.render(scene, camera);
    }

    if (reducedMotion) {
      // One frame, then stop — static texture, no motion
      renderer.render(scene, camera);
    } else {
      animate();
    }

    // ── Resize ───────────────────────────────────────────────────
    function onResize() {
      if (!container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (reducedMotion) renderer.render(scene, camera);
    }
    window.addEventListener('resize', onResize);

    // ── Cleanup ──────────────────────────────────────────────────
    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      scene.clear();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  );
}
