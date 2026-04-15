-- Flight route cache.
--
-- Routes are stable: QR541 always flies CCU→DOH regardless of date.
-- We call AirLabs once per flight number, cache the route here, and
-- return the cached row on every subsequent lookup — no further API
-- quota consumed.
--
-- No expiry: if a route genuinely changes (rare — airline restructuring)
-- the row can be deleted from the Studio and the next lookup refreshes it.

CREATE TABLE IF NOT EXISTS public.flight_cache (
  flight_iata      TEXT PRIMARY KEY,           -- e.g. "QR541"
  airline_iata     TEXT,                       -- e.g. "QR"
  airline_name     TEXT,                       -- e.g. "Qatar Airways"
  dep_iata         TEXT        NOT NULL,       -- departure airport IATA
  dep_airport      TEXT,                       -- full airport name
  dep_timezone     TEXT,                       -- IANA tz, e.g. "Asia/Kolkata"
  arr_iata         TEXT        NOT NULL,       -- arrival airport IATA
  arr_airport      TEXT,                       -- full airport name
  arr_timezone     TEXT,                       -- IANA tz
  duration_minutes INTEGER,                    -- scheduled flight time in minutes
  cached_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.flight_cache IS
  'Permanent cache of flight-number → route mappings populated on first '
  'AirLabs lookup. Routes are stable so rows are never auto-expired.';

-- Only the service-role key (used by API routes) can write.
-- No user-facing reads needed — the API route does the lookup.
ALTER TABLE public.flight_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages flight cache"
  ON public.flight_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
