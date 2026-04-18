import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Flight lookup API using AirLabs.
 *
 * Strategy — DB-first cache:
 *   1. Check `flight_cache` table for this flight_iata.
 *   2. Cache hit → return immediately, zero AirLabs quota consumed.
 *   3. Cache miss → call AirLabs /schedules, persist to DB, return.
 *
 * Why routes are safe to cache permanently:
 *   QR541 has flown CCU→DOH for years and will continue to do so.
 *   If an airline restructures a route, delete the row in the Studio
 *   and the next lookup refreshes it.
 *
 * Times: AirLabs returns scheduled times for current/upcoming days.
 *   We store the route (airports + duration) in the cache but NOT times,
 *   since times are date-specific. The client receives approximate times
 *   constructed from the user's chosen date + scheduled duration.
 *   For cache hits, departure is set to noon local (safe anchor) and
 *   arrival = departure + duration.
 *
 * Access control (bug M01):
 *   * Requires a signed-in Clerk user. The only caller is the post
 *     wizard, which already gates on sign-in, so this doesn't break any
 *     anon flow — it just closes the abuse vector (anon scripts burning
 *     AirLabs quota).
 *   * Per-user rate limit via check_rate_limit (20 / min). Authenticated
 *     users with typo loops or stuck forms get a 429 instead of a
 *     burned AirLabs quota.
 *   * Flight-number format validated AFTER canonicalisation — bogus
 *     strings like "hello12" are rejected before a cache lookup, so
 *     they can't pollute flight_cache.
 */

const RATE_LIMIT_PER_MINUTE = 20;

const RequestSchema = z.object({
  flightNumber: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]/g, '') : v),
    z.string().regex(/^[A-Z0-9]{2}\d{1,4}$/, 'Flight number must look like "QR540" or "6E123".'),
  ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

// ── AirLabs /routes response ─────────────────────────────────────────────────
// /routes returns static scheduled route data (not real-time). Works for any
// valid flight_iata regardless of whether the flight is in the air right now.
// /flights only returns currently airborne flights — wrong tool for our job.

interface AirlabsRouteItem {
  airline_iata?: string;
  airline_icao?: string;
  flight_iata?: string;
  flight_icao?: string;
  flight_number?: string;
  dep_iata: string;
  dep_icao?: string;
  dep_terminal?: string | null;
  dep_time?: string; // "HH:mm" local (no date — static schedule)
  dep_time_utc?: string;
  arr_iata: string;
  arr_icao?: string;
  arr_terminal?: string | null;
  arr_time?: string; // "HH:mm" local
  arr_time_utc?: string;
  duration?: number; // minutes
  days?: string[]; // ["mon","tue",...]
  aircraft_icao?: string;
}

interface AirlabsResponse {
  response?: AirlabsRouteItem[];
  error?: { message: string; code: string };
}

// ── Airline name lookup (common carriers) ───────────────────────────────────

const AIRLINE_NAMES: Record<string, string> = {
  '6E': 'IndiGo',
  '9W': 'Jet Airways',
  AI: 'Air India',
  UK: 'Vistara',
  SG: 'SpiceJet',
  G8: 'Go First',
  I5: 'Air Asia India',
  IX: 'Air India Express',
  QP: 'Akasa Air',
  QR: 'Qatar Airways',
  EK: 'Emirates',
  EY: 'Etihad Airways',
  KL: 'KLM',
  AF: 'Air France',
  LH: 'Lufthansa',
  BA: 'British Airways',
  SQ: 'Singapore Airlines',
  TK: 'Turkish Airlines',
  MS: 'EgyptAir',
  ET: 'Ethiopian Airlines',
  LX: 'Swiss',
  OS: 'Austrian Airlines',
  AY: 'Finnair',
  SK: 'SAS',
  DY: 'Norwegian',
  AA: 'American Airlines',
  UA: 'United Airlines',
  DL: 'Delta Air Lines',
  AC: 'Air Canada',
  MH: 'Malaysia Airlines',
  TG: 'Thai Airways',
  GA: 'Garuda Indonesia',
  NH: 'ANA',
  JL: 'Japan Airlines',
  CX: 'Cathay Pacific',
  OZ: 'Asiana Airlines',
  KE: 'Korean Air',
  WY: 'Oman Air',
  GF: 'Gulf Air',
  SV: 'Saudia',
  FZ: 'flydubai',
  G9: 'Air Arabia',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function durationString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Build approximate departure/arrival ISO strings.
 * When we only have the date + duration (cache hit with no live times),
 * anchor departure at noon UTC on the chosen date. This avoids timezone
 * edge-cases (early-morning UTC departure slipping to the prior day).
 */
function approximateTimes(
  date: string,
  durationMinutes: number | null,
): { departure: string; arrival: string } {
  const departure = `${date}T12:00:00Z`;
  if (!durationMinutes) return { departure, arrival: departure };
  const arrMs = new Date(departure).getTime() + durationMinutes * 60_000;
  return { departure, arrival: new Date(arrMs).toISOString() };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth. Only the post wizard hits this, and posting requires
  // sign-in — so blocking anon doesn't break any user-facing flow.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Please sign in.', fallbackToManual: true },
      { status: 401 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // ── Per-user rate limit. 20 lookups/minute is ~6 legs worth of
  // "look up, fix typo, re-look-up" — enough for legit use, restrictive
  // enough to blunt a script.
  const allowed = await checkRateLimit(supabase, 'flights/lookup', RATE_LIMIT_PER_MINUTE);
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many lookups — try again in a minute.',
        fallbackToManual: true,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Strict format validation runs AFTER auth + rate-limit so garbage
  // lookups can't poison the cache, and rejected inputs still count
  // against the per-user bucket (no fast path for attackers to skip).
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request',
        fallbackToManual: false,
      },
      { status: 400 },
    );
  }

  // Preprocess already canonicalised flightNumber — trust it.
  const { flightNumber: flightIata, date } = parsed.data;

  // ── 1. DB cache lookup ─────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from('flight_cache')
    .select('*')
    .eq('flight_iata', flightIata)
    .maybeSingle();

  if (cached) {
    const { departure, arrival } = approximateTimes(date, cached.duration_minutes);
    console.log(`[flight-lookup] cache hit for ${flightIata}`);
    return NextResponse.json({
      success: true,
      source: 'cache',
      flight: {
        flightNumber: flightIata,
        airline: cached.airline_name ?? cached.airline_iata ?? 'Unknown airline',
        airlineIata: cached.airline_iata ?? '',
        from: {
          iata: cached.dep_iata,
          airport: cached.dep_airport ?? cached.dep_iata,
          timezone: cached.dep_timezone ?? '',
        },
        to: {
          iata: cached.arr_iata,
          airport: cached.arr_airport ?? cached.arr_iata,
          timezone: cached.arr_timezone ?? '',
        },
        departure,
        arrival,
        duration: cached.duration_minutes ? durationString(cached.duration_minutes) : '',
        status: 'scheduled',
        aircraft: null,
      },
    });
  }

  // ── 2. AirLabs API call ────────────────────────────────────────────────────
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) {
    console.error('[flight-lookup] AIRLABS_API_KEY not configured');
    return NextResponse.json(
      { success: false, error: 'Flight lookup service not configured', fallbackToManual: true },
      { status: 503 },
    );
  }

  // /routes returns static scheduled route data — works for any valid flight
  // number regardless of whether it's currently airborne. The /flights endpoint
  // (despite being named similarly) only returns currently-in-flight aircraft.
  const url = new URL('https://airlabs.co/api/v9/routes');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('flight_iata', flightIata);

  console.log(`[flight-lookup] AirLabs /routes request for ${flightIata}`);

  let airlabsData: AirlabsResponse;
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 }, // always fresh from AirLabs
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[flight-lookup] AirLabs HTTP error:', res.status, text);
      return NextResponse.json(
        { success: false, error: 'Flight lookup service unavailable', fallbackToManual: true },
        { status: 503 },
      );
    }

    airlabsData = (await res.json()) as AirlabsResponse;
  } catch (err) {
    console.error('[flight-lookup] AirLabs fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Network error reaching flight service', fallbackToManual: true },
      { status: 503 },
    );
  }

  if (airlabsData.error) {
    console.error('[flight-lookup] AirLabs API error:', airlabsData.error);
    return NextResponse.json(
      {
        success: false,
        error: `Flight lookup failed: ${airlabsData.error.message}`,
        fallbackToManual: true,
      },
      { status: 503 },
    );
  }

  const routes = airlabsData.response ?? [];
  if (routes.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Flight ${flightIata} not found. Enter the route manually above.`,
        fallbackToManual: true,
      },
      { status: 404 },
    );
  }

  // /routes may return multiple entries per flight_iata (e.g. different days
  // of the week). Take the first — the route itself is the same across days.
  const schedule = routes[0]!;

  if (!schedule.dep_iata || !schedule.arr_iata) {
    return NextResponse.json(
      { success: false, error: 'Incomplete flight data from API', fallbackToManual: true },
      { status: 500 },
    );
  }

  const airlineIata = schedule.airline_iata ?? '';
  const airlineName = AIRLINE_NAMES[airlineIata] ?? airlineIata;

  // ── 3. Persist to DB cache ─────────────────────────────────────────────────
  // /routes doesn't return airport names or timezones — we store the IATA and
  // duration, which is all the cache needs to hydrate future lookups.
  await supabase.from('flight_cache').upsert(
    {
      flight_iata: flightIata,
      airline_iata: airlineIata || null,
      airline_name: airlineName || null,
      dep_iata: schedule.dep_iata,
      dep_airport: schedule.dep_iata,
      dep_timezone: null,
      arr_iata: schedule.arr_iata,
      arr_airport: schedule.arr_iata,
      arr_timezone: null,
      duration_minutes: schedule.duration ?? null,
      cached_at: new Date().toISOString(),
    },
    { onConflict: 'flight_iata' },
  );

  // ── 4. Build response ──────────────────────────────────────────────────────
  // /routes gives dep_time / dep_time_utc as "HH:mm" — combine with user's date.
  let departure: string;
  let arrival: string;

  if (schedule.dep_time_utc && /^\d{2}:\d{2}$/.test(schedule.dep_time_utc)) {
    departure = `${date}T${schedule.dep_time_utc}:00Z`;
    // Arrival time of day on the same UTC day — if flight crosses midnight the
    // duration will push the arrival correctly via addMinutes
    const depMs = new Date(departure).getTime();
    const durMs = (schedule.duration ?? 0) * 60_000;
    arrival = new Date(depMs + durMs).toISOString();
  } else {
    const approx = approximateTimes(date, schedule.duration ?? null);
    departure = approx.departure;
    arrival = approx.arrival;
  }

  return NextResponse.json({
    success: true,
    source: 'airlabs',
    flight: {
      flightNumber: flightIata,
      airline: airlineName,
      airlineIata,
      from: {
        iata: schedule.dep_iata,
        airport: schedule.dep_iata,
        timezone: '',
      },
      to: {
        iata: schedule.arr_iata,
        airport: schedule.arr_iata,
        timezone: '',
      },
      departure,
      arrival,
      duration: schedule.duration ? durationString(schedule.duration) : '',
      status: 'scheduled',
      aircraft: schedule.aircraft_icao ?? null,
    },
  });
}
