import { ImageResponse } from 'next/og';

/**
 * Default Open Graph image — used when a page doesn't define its own.
 * 1200×630 is the canonical size every social platform respects
 * (Facebook, LinkedIn, Slack, X, Discord, iMessage). Anything else
 * gets cropped or pillarboxed somewhere.
 *
 * The image lifts the landing-page voice ("a companion on the flight
 * home") rather than the dictionary one — when a Saathi link gets
 * shared, the preview should sound like Saathi, not like a SaaS.
 *
 * Per-page OG: drop a sibling opengraph-image.tsx in any route group
 * to override (e.g. /trip/[id] could render the route + date for a
 * shareable preview).
 */
export const alt = 'Saathi — a companion on the flight home';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#faf9f7',
        display: 'flex',
        flexDirection: 'column',
        padding: 80,
        justifyContent: 'space-between',
        fontFamily: 'serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          color: '#2e241c',
          fontSize: 44,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 60, display: 'flex' }}>🌼</span>
        Saathi
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 84,
            lineHeight: 1.05,
            color: '#2e241c',
            letterSpacing: '-0.02em',
            fontWeight: 600,
            maxWidth: 980,
          }}
        >
          A companion on the flight home.
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#5b4a3a',
            fontFamily: 'sans-serif',
            maxWidth: 900,
          }}
        >
          We pair elderly travellers with someone already flying the same route. No parent navigates
          an unfamiliar airport alone.
        </div>
      </div>
      <div
        style={{
          fontSize: 22,
          color: '#5b4a3a',
          fontFamily: 'sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: '#b45309', fontWeight: 600 }}>getsaathi.com</span>
      </div>
    </div>,
    { ...size, emoji: 'twemoji' },
  );
}
