-- 0021_lock_down_notes.sql
--
-- Close bug M09 (option C): keep the discovery-friendly anon-readable
-- posture for most of public_trips, but lock the free-text `notes`
-- column behind auth so an anonymous scraper can't pull contact info
-- users pasted to bypass the match gate.
--
-- Two-layer fix:
--   1. Rebuild public.public_trips WITHOUT notes. Anon queries through
--      the view (the app's default path) no longer see notes.
--   2. Revoke anon's blanket SELECT on public.trips and re-grant on
--      every column EXCEPT notes. This blocks the "just hit
--      /rest/v1/trips?select=notes directly" vector — anon now gets a
--      permission error when trying to read the notes column.
--
-- Authenticated users' access is unchanged: they see notes via the
-- base table (needed for match-participant display and future features
-- that surface notes to signed-in users).
--
-- Paired with a Zod `.refine` on the trip-post action that rejects
-- obvious phone / email patterns at submit — honest users pasting
-- their WhatsApp number get a clear error rather than silently
-- bypassing the match gate.

-- ── 1. Rebuild public_trips without notes ──────────────────────────────
-- Column order is fixed by CREATE OR REPLACE VIEW semantics (you can
-- append but not reorder) — dropping the view first lets us omit a
-- column cleanly. This is the third rebuild (0004 → 0013 → 0021).
drop view if exists public.public_trips;

create view public.public_trips
  with (security_invoker = true) as
select
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
  t.status,
  t.created_at,
  t.flight_numbers,
  coalesce(
    (
      select array_agg(tr.age_band order by tr.sort_order)
        from public.trip_travellers tr
       where tr.trip_id = t.id and tr.age_band is not null
    ),
    array[]::text[]
  ) as traveller_age_bands,
  coalesce(
    (select count(*)::int from public.trip_travellers tr where tr.trip_id = t.id),
    0
  ) as traveller_count
from public.trips t;

grant select on public.public_trips to anon, authenticated;

-- ── 2. Column-level privileges on the base trips table ────────────────
-- Revoking the table-level grant first: Postgres privileges are
-- union-style, so table-level SELECT overrides any column-level REVOKE.
-- Re-granting on explicit columns (all of them except `notes`) blocks
-- anon from reading notes even via a direct PostgREST call to /trips.
revoke select on public.trips from anon;

grant select (
  id,
  user_id,
  kind,
  route,
  travel_date,
  flight_numbers,
  airline,
  languages,
  gender_preference,
  help_categories,
  thank_you_eur,
  status,
  created_at
) on public.trips to anon;

-- authenticated keeps full SELECT (they can still read notes via the
-- base table for match-participant display and future features).

-- ── Note for future migrations ─────────────────────────────────────────
-- Any future column added to public.trips needs an explicit grant to
-- anon here (assuming it's safe for anon). Otherwise the app will see
-- "permission denied for column X" when anon clients query the table.
-- Private columns (anything we might add like medical_notes on trips
-- itself) simply stay out of the grant list.
