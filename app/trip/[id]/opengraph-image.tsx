import { ImageResponse } from 'next/og';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db';
import { publicProfiles, publicTrips } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TripOgImage({ params }: Props) {
  const { id } = await params;

  // Anon-readable through public_trips / public_profiles (security_invoker views).
  // Note: public_trips doesn't expose `notes` (revoked from anon in 0021).
  // Renders an empty notes snippet for unauthenticated OG crawls, matching the
  // intent of the column-level revoke.
  const { trip, profile } = await withUser(null, async (tx) => {
    const tripRows = await tx
      .select({
        route: publicTrips.route,
        travel_date: publicTrips.travelDate,
        airline: publicTrips.airline,
        kind: publicTrips.kind,
        user_id: publicTrips.userId,
      })
      .from(publicTrips)
      .where(eq(publicTrips.id, id))
      .limit(1);
    const trip = tripRows[0] ?? null;
    if (!trip?.user_id) return { trip, profile: null };
    const profileRows = await tx
      .select({ display_name: publicProfiles.displayName, photo_url: publicProfiles.photoUrl })
      .from(publicProfiles)
      .where(eq(publicProfiles.id, trip.user_id))
      .limit(1);
    return { trip, profile: profileRows[0] ?? null };
  });

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

  // Short notes: public_trips doesn't expose notes to anon (0021), so this
  // is always null on the OG path. The visual leaves room for it if the view
  // ever surfaces it again.
  const notesSnippet: string | null = null;

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

  // The emotional tagline rotates slightly per kind so request shares
  // read as "find someone for them" and offer shares read as "I'm
  // offering". Either way the lower-strip reinforces the why: nobody
  // should fly alone if a kind stranger on the same plane could help.
  const taglineLine1 = isRequest
    ? 'No one should navigate an airport alone.'
    : 'No one should navigate an airport alone.';
  const taglineLine2 = isRequest
    ? 'Help a family find a kind companion on this flight.'
    : `${firstName} is volunteering — a small act of kindness, in the air.`;

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
      {/* Top accent bar */}
      <div style={{ width: '100%', height: 8, background: '#078a52', display: 'flex' }} />

      {/* Decorative circles — give the cream canvas warmth */}
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
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          left: -60,
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: '#fed7aa',
          opacity: 0.4,
          display: 'flex',
        }}
      />

      {/* Brand strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '20px 72px 0',
        }}
      >
        <span style={{ fontSize: 30, display: 'flex' }}>🌼</span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#078a52',
            letterSpacing: '-0.01em',
            display: 'flex',
          }}
        >
          saathi
        </span>
        <span style={{ color: '#dad4c8', display: 'flex' }}>·</span>
        <span style={{ fontSize: 18, color: '#9f9b93', display: 'flex' }}>
          a community on the flight home
        </span>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '32px 72px 28px',
          justifyContent: 'space-between',
        }}
      >
        {/* Top: profile + headline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
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
                width={72}
                height={72}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: '#4a3d32',
                  display: 'flex',
                }}
              >
                {initials}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 18,
                color: isRequest ? '#0089ad' : '#9d6a09',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              {isRequest ? 'Companion wanted' : 'Offering to help'}
            </span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: '#4a3d32',
                letterSpacing: '-0.02em',
                display: 'flex',
              }}
            >
              {headline}
            </span>
          </div>
        </div>

        {/* Middle: the route — the heart of the card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              gap: 14,
              fontSize: 24,
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
                fontSize: 20,
                color: '#7c6f5f',
                fontStyle: 'italic',
                maxWidth: 900,
                display: 'flex',
                marginTop: 4,
              }}
            >
              &ldquo;{notesSnippet}&rdquo;
            </div>
          ) : null}
        </div>

        {/* Bottom: emotional tagline + URL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: 18,
            borderTop: '1px solid #dad4c8',
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: '#4a3d32',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              display: 'flex',
            }}
          >
            {taglineLine1}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 16, color: '#7c6f5f', display: 'flex' }}>{taglineLine2}</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#078a52',
                letterSpacing: '-0.01em',
                display: 'flex',
              }}
            >
              getsaathi.com
            </span>
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      emoji: 'twemoji',
    },
  );
}
