-- 0006_expose_flight_numbers.sql
-- Expose flight_numbers in the public_trips view.
--
-- Rationale: flight number is now the primary match criterion (see
-- lib/matching.ts — a ±3-day date window produced misleading matches
-- because two people on the same route but different planes can't help
-- each other). For the match to be useful, anon users need to see which
-- flight someone is on so they can filter by it.
--
-- Privacy trade-off: adding flight_numbers on top of already-public
-- route + date + age band is a small marginal increase in specificity.
-- Elderly PII (name, photo, medical notes) remains redacted. Contact
-- details still require an accepted match request.

-- Postgres allows CREATE OR REPLACE VIEW to APPEND columns, not to insert
-- them in the middle — swapping positions looks like a rename to the
-- planner and is rejected. So `flight_numbers` goes at the end.
create or replace view public.public_trips
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
  t.elderly_age_band,
  t.created_at,
  t.flight_numbers
from public.trips t;

grant select on public.public_trips to anon, authenticated;

-- Index to make flight-number filtering fast once volume picks up.
create index if not exists trips_flight_numbers_gin
  on public.trips using gin (flight_numbers);
