-- 0013_trip_elders.sql
--
-- Move the single-parent columns on `trips` into a new 1:N `trip_elders`
-- table. A family posting a request may be sending more than one elderly
-- relative on the same flight (couple, siblings, parent + in-law, etc.);
-- the old single-row schema couldn't express that.
--
-- Pre-launch safe to reshape: no user-facing data exists yet in prod.
-- Migration still preserves any existing rows for safety.

-- ── 1. Drop the single-parent check constraint on trips ────────────────
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS elderly_only_on_request;

-- ── 2. Create the new trip_elders table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_elders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  first_name    TEXT,                                    -- private
  age_band      TEXT CHECK (age_band IN ('60-70','70-80','80+') OR age_band IS NULL),
  medical_notes TEXT,                                    -- private
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_elders_trip_id_idx ON public.trip_elders (trip_id);
CREATE INDEX IF NOT EXISTS trip_elders_sort_idx
  ON public.trip_elders (trip_id, sort_order);

-- ── 3. RLS: trip owner controls their elders ───────────────────────────
ALTER TABLE public.trip_elders ENABLE ROW LEVEL SECURITY;

-- Full CRUD for the trip owner (authenticated via Clerk, clerk_user_id())
CREATE POLICY "trip_elders owner full access"
  ON public.trip_elders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id AND t.user_id = public.clerk_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id AND t.user_id = public.clerk_user_id()
    )
  );

-- Private-by-default: no anon / authenticated SELECT policy. All public
-- exposure goes through the `public_trips` view below, which only
-- aggregates the non-PII columns (age_band count), never names or notes.

-- ── 4. Copy existing single-parent data into the new table ─────────────
INSERT INTO public.trip_elders (trip_id, first_name, age_band, medical_notes, sort_order)
SELECT
  id,
  elderly_first_name,
  elderly_age_band,
  elderly_medical_notes,
  0
FROM public.trips
WHERE kind = 'request'
  AND (
    elderly_first_name IS NOT NULL
    OR elderly_age_band IS NOT NULL
    OR elderly_medical_notes IS NOT NULL
  );

-- ── 5. Drop the old view (references columns about to be dropped) ─────
DROP VIEW IF EXISTS public.public_trips;

-- ── 6. Drop the old single-parent columns from trips ───────────────────
ALTER TABLE public.trips
  DROP COLUMN IF EXISTS elderly_first_name,
  DROP COLUMN IF EXISTS elderly_age_band,
  DROP COLUMN IF EXISTS elderly_photo_url,
  DROP COLUMN IF EXISTS elderly_medical_notes;

-- ── 7. Recreate public_trips with aggregate elder info ────────────────
-- Exposes: array of age bands (one per elder), total elder count.
-- Names + medical notes stay behind RLS.
CREATE VIEW public.public_trips
  WITH (security_invoker = true) AS
SELECT
  t.id,
  t.user_id,
  t.kind,
  t.route,
  t.travel_date,
  t.airline,
  t.languages,
  t.gender_preference,
  t.help_categories,
  t.thank_you_eur,
  t.notes,
  t.status,
  t.created_at,
  t.flight_numbers,
  -- All elder age bands for this trip, ordered by sort_order.
  COALESCE(
    (
      SELECT array_agg(e.age_band ORDER BY e.sort_order)
      FROM public.trip_elders e
      WHERE e.trip_id = t.id AND e.age_band IS NOT NULL
    ),
    ARRAY[]::text[]
  ) AS elder_age_bands,
  -- Total count of elders on this request (0 for offers).
  COALESCE(
    (SELECT COUNT(*)::int FROM public.trip_elders e WHERE e.trip_id = t.id),
    0
  ) AS elder_count
FROM public.trips t;

GRANT SELECT ON public.public_trips TO anon, authenticated;
