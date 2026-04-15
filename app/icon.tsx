import { ImageResponse } from 'next/og';

/**
 * Favicon — generated at build time so we don't ship a binary asset and
 * the colour palette stays in lockstep with the design system. 32×32 is
 * what most browsers and bookmark bars rasterise to.
 *
 * Marigold "S" on espresso ground to match the landing page accent
 * (--marigold-700 → #b45309). If the brand colours move, edit here.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#2e241c',
        color: '#f59e0b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 700,
        fontFamily: 'serif',
        letterSpacing: '-0.02em',
        borderRadius: 6,
      }}
    >
      S
    </div>,
    { ...size },
  );
}
