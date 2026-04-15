import { ImageResponse } from 'next/og';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TripOgImage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: trip } = await supabase
    .from('public_trips')
    .select('route, travel_date, airline, kind, notes, user_id')
    .eq('id', id)
    .maybeSingle();

  const { data: profile } = trip?.user_id
    ? await supabase
        .from('public_profiles')
        .select('display_name, photo_url')
        .eq('id', trip.user_id)
        .maybeSingle()
    : { data: null };

  const displayName = profile?.display_name ?? 'Someone';
  const photoUrl = profile?.photo_url ?? null;
  const route: string[] = trip?.route ?? ['?', '?'];
  const isRequest = trip?.kind === 'request';

  // Format date: "17 May 2025"
  let dateStr = '';
  if (trip?.travel_date) {
    const d = new Date(`${trip.travel_date}T12:00:00Z`);
    dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const routeStr = route.join(' → ');
  const firstName = displayName.split(' ')[0] ?? displayName;

  // Headline copy
  const headline = isRequest ? `Looking for a companion` : `${firstName} is offering to help`;

  // Short notes (max 90 chars)
  const notesSnippet =
    trip?.notes && trip.notes.length > 0
      ? trip.notes.length > 90
        ? trip.notes.slice(0, 87) + '…'
        : trip.notes
      : null;

  // Fetch profile photo and inline as data URL. Satori (the engine next/og
  // uses) handles HTTPS URLs, but the data-URL path is more reliable when
  // the upstream has CORS or content-disposition quirks. Failures fall
  // back to initials — we log so the fallback isn't invisible.
  let photoData: string | null = null;
  if (photoUrl) {
    try {
      const res = await fetch(photoUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const mime = res.headers.get('content-type') ?? 'image/jpeg';
        photoData = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
        console.log(`[trip-og] photo loaded for ${displayName} (${buf.byteLength} bytes, ${mime})`);
      } else {
        console.warn(`[trip-og] photo fetch ${res.status} for ${photoUrl}`);
      }
    } catch (err) {
      console.warn('[trip-og] photo fetch threw:', err);
    }
  } else {
    console.log(`[trip-og] no photo_url on profile for ${displayName} (trip=${id})`);
  }

  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#faf9f7',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top green accent bar */}
      <div style={{ width: '100%', height: 8, background: '#078a52', display: 'flex' }} />

      {/* Decorative circle — top right */}
      <div
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: '#84e7a5',
          opacity: 0.18,
          display: 'flex',
        }}
      />
      {/* Decorative circle — bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          left: -60,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: '#dad4c8',
          opacity: 0.3,
          display: 'flex',
        }}
      />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 72px',
          justifyContent: 'space-between',
        }}
      >
        {/* Top: profile + headline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* Avatar */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#dad4c8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '3px solid #fff',
            }}
          >
            {photoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoData}
                alt=""
                width={80}
                height={80}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#4a3d32',
                  display: 'flex',
                }}
              >
                {initials}
              </span>
            )}
          </div>

          {/* Headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 22,
                color: '#9f9b93',
                fontWeight: 500,
                letterSpacing: '-0.01em',
              }}
            >
              {isRequest ? 'Request on Saathi' : 'Offer on Saathi'}
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: '#4a3d32',
                letterSpacing: '-0.02em',
              }}
            >
              {headline}
            </span>
          </div>
        </div>

        {/* Middle: route */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: '#02492a',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              fontFamily: 'ui-monospace, monospace',
              display: 'flex',
            }}
          >
            {routeStr}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 26,
              color: '#4a3d32',
              fontWeight: 500,
            }}
          >
            <span>{dateStr}</span>
            {trip?.airline ? (
              <>
                <span style={{ color: '#dad4c8', display: 'flex' }}>·</span>
                <span style={{ color: '#9f9b93' }}>{trip.airline}</span>
              </>
            ) : null}
          </div>

          {notesSnippet ? (
            <div
              style={{
                fontSize: 22,
                color: '#9f9b93',
                fontStyle: 'italic',
                maxWidth: 800,
                display: 'flex',
              }}
            >
              &ldquo;{notesSnippet}&rdquo;
            </div>
          ) : null}
        </div>

        {/* Bottom: Saathi brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 40, display: 'flex' }}>🌼</span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#078a52',
                letterSpacing: '-0.02em',
                display: 'flex',
              }}
            >
              saathi
            </span>
          </div>
          <span style={{ fontSize: 20, color: '#9f9b93' }}>getsaathi.com</span>
        </div>
      </div>
    </div>,
    {
      ...size,
      emoji: 'twemoji',
    },
  );
}
