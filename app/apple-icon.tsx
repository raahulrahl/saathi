import { ImageResponse } from 'next/og';

/**
 * Apple touch icon — shown on iOS home screens when someone "Add to
 * Home Screen". Larger than the favicon so the corners can breathe.
 * 180×180 is the size iOS prefers; smaller variants are auto-generated
 * from this one by the OS.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        fontSize: 120,
        fontWeight: 700,
        fontFamily: 'serif',
        letterSpacing: '-0.02em',
      }}
    >
      S
    </div>,
    { ...size },
  );
}
