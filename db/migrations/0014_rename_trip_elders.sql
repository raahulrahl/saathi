-- 0014_rename_trip_elders.sql
--
-- Rename `trip_elders` → `trip_travellers` and related view columns.
--
-- Why: the original name baked in an assumption that the person being
-- helped is elderly. Saathi's mission is broader — a pregnant traveller,
-- a first-time flyer with a language barrier, a passenger with a
-- disability, a child flying unaccompanied, can all legitimately sit on
-- a request trip. "Traveller" is neutral and accurate; the `kind='request'
-- | 'offer'` discriminator on `trips` already tells us role.
--
-- Pre-launch: no user data to migrate. ALTER TABLE renames are cheap
-- (metadata-only), indexes + policies follow the table.

-- ── 1. Rename the table + its indexes ──────────────────────────────────
alter table public.trip_elders rename to trip_travellers;

alter index if exists public.trip_elders_trip_id_idx rename to trip_travellers_trip_id_idx;
alter index if exists public.trip_elders_sort_idx    rename to trip_travellers_sort_idx;

-- ── 2. Rename the RLS policy (must match table's new name visually) ───
alter policy "trip_elders owner full access" on public.trip_travellers
  rename to "trip_travellers owner full access";

-- ── 3. Rebuild public_trips with renamed aggregate columns ────────────
-- CREATE OR REPLACE VIEW can't rename existing columns; drop + recreate.
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
  t.notes,
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
