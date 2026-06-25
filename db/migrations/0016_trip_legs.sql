-- 0016_trip_legs.sql
--
-- Decompose trips into legs, matched by (origin, destination, date) or
-- (flight_number, date). Fixes bugs 02, 03, 04 structurally:
--
--   * 02 Partial-leg helpers never match — a student on the DOH→AMS
--     leg of a larger CCU→DOH→AMS itinerary now surfaces as a direct
--     leg-level match.
--   * 03 routeMatch() direction-blind — a leg row is a directed edge
--     (origin and destination are fixed columns); reverse-direction
--     travellers can no longer show up as "endpoints" matches.
--   * 04 Flight-number match ignores date — the partial index is on
--     `(flight_number, travel_date)`; equality on the flight number
--     alone can't match across dates.
--
-- Design (from bugs/ALGORITHM.md):
--   * One row per consecutive airport pair in `trips.route`.
--   * Synced by trigger on insert/update of trips.route / travel_date /
--     flight_numbers. Delete cascades via the FK.
--   * flight_numbers[i] is assumed to align with route[i]→route[i+1]
--     — the post wizard collects them per-leg. If a trip is shorter
--     on flight_numbers than on legs, the missing legs store NULL.

-- ── 1. Table ────────────────────────────────────────────────────────────
create table if not exists public.trip_legs (
  id            uuid        primary key default gen_random_uuid(),
  trip_id       uuid        not null references public.trips(id) on delete cascade,
  leg_index     int         not null check (leg_index >= 0),
  origin        text        not null,
  destination   text        not null,
  travel_date   date        not null,
  flight_number text,
  created_at    timestamptz not null default now(),
  unique (trip_id, leg_index)
);

-- Hot path: "legs matching (origin, destination, date)" — single index seek.
create index if not exists trip_legs_od_date_idx
  on public.trip_legs (origin, destination, travel_date);

-- Strongest signal: "legs matching (flight_number, date)". Partial — only
-- rows with a flight_number, which keeps the index small.
create index if not exists trip_legs_flight_date_idx
  on public.trip_legs (flight_number, travel_date)
  where flight_number is not null;

-- Supplementary: lookup by trip (for trip detail pages).
create index if not exists trip_legs_trip_idx
  on public.trip_legs (trip_id);

-- ── 2. RLS — mirror trips ──────────────────────────────────────────────
alter table public.trip_legs enable row level security;

-- Public read: matches trips.public_read (anon-readable pre-launch per
-- CLAUDE.md memory). No PII lives in trip_legs — just airport codes,
-- dates, and flight numbers, all already exposed via public_trips.
create policy "trip_legs: public read" on public.trip_legs
  for select using (true);

-- Writes only through the sync trigger (SECURITY DEFINER), so no app-side
-- insert/update/delete policy. Trigger is the only writer; cascade handles
-- deletes.

-- ── 3. Sync trigger ────────────────────────────────────────────────────
-- SECURITY DEFINER: runs as the function's owner (postgres), bypassing
-- RLS on the insert. Essential because the trigger fires as the trip's
-- owner who doesn't have their own write policy on trip_legs.
create or replace function public.rebuild_trip_legs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trip_legs where trip_id = new.id;

  insert into public.trip_legs (trip_id, leg_index, origin, destination, travel_date, flight_number)
  select new.id,
         i - 1,
         new.route[i],
         new.route[i + 1],
         new.travel_date,
         case
           when new.flight_numbers is not null
                and array_length(new.flight_numbers, 1) >= i
           then new.flight_numbers[i]
           else null
         end
    from generate_subscripts(new.route, 1) as i
   where i < array_length(new.route, 1);

  return new;
end;
$$;

drop trigger if exists trip_legs_sync on public.trips;
create trigger trip_legs_sync
  after insert or update of route, travel_date, flight_numbers on public.trips
  for each row execute function public.rebuild_trip_legs();

-- ── 4. Backfill existing trips ─────────────────────────────────────────
-- Safe to run multiple times: the unique (trip_id, leg_index) would
-- conflict, so we clear first.
delete from public.trip_legs;

insert into public.trip_legs (trip_id, leg_index, origin, destination, travel_date, flight_number)
select t.id,
       i - 1,
       t.route[i],
       t.route[i + 1],
       t.travel_date,
       case
         when t.flight_numbers is not null
              and array_length(t.flight_numbers, 1) >= i
         then t.flight_numbers[i]
         else null
       end
  from public.trips t,
       generate_subscripts(t.route, 1) as i
 where i < array_length(t.route, 1);

grant select on public.trip_legs to anon, authenticated;
