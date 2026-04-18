-- 0022_create_trip_rpc.sql
--
-- Replace the two-step trips-then-trip_travellers insert flow in the
-- post Server Action with a single Postgres function call. Closes
-- bug M08 (non-transactional rollback).
--
-- Postgres wraps every function invocation in a single transaction
-- (unless you go out of your way otherwise), so either both the trip
-- and its traveller rows land, or neither does. No naive DELETE-to-
-- rollback path that can itself fail and leave a ghost trip row.
--
-- Security: SECURITY INVOKER (the default) — the function runs under
-- the caller's role, so the existing RLS policies on `trips` and
-- `trip_travellers` apply unchanged:
--   * trips: owner writes — satisfied because we insert user_id =
--     public.clerk_user_id().
--   * trip_travellers: owner full access — satisfied because the
--     trip row with our user_id was just inserted inside this txn.
--
-- The function also defends against a tampered payload attaching
-- travellers to an 'offer' (`p_kind = 'request'` gate around the
-- traveller insert).

create or replace function public.create_trip_with_travellers(
  p_kind              text,
  p_route             text[],
  p_travel_date       date,
  p_airline           text,
  p_flight_numbers    text[],
  p_languages         text[],
  p_gender_preference text,
  p_help_categories   text[],
  p_thank_you_eur     int,
  p_notes             text,
  p_travellers        jsonb default '[]'::jsonb
) returns uuid
language plpgsql
as $$
declare
  v_trip_id uuid;
begin
  -- 1. Create the trip row. The trip_legs_sync trigger fires
  --    automatically (AFTER INSERT) inside this transaction, so if
  --    the traveller insert below fails, the legs also roll back.
  insert into public.trips (
    user_id,
    kind,
    route,
    travel_date,
    airline,
    flight_numbers,
    languages,
    gender_preference,
    help_categories,
    thank_you_eur,
    notes
  ) values (
    public.clerk_user_id(),
    p_kind,
    p_route,
    p_travel_date,
    p_airline,
    p_flight_numbers,
    p_languages,
    p_gender_preference,
    p_help_categories,
    p_thank_you_eur,
    p_notes
  )
  returning id into v_trip_id;

  -- 2. Insert traveller rows for a request trip only. Belt-and-
  --    suspenders check on p_kind — the action also filters, but a
  --    tampered payload shouldn't be able to attach travellers to an
  --    offer.
  if p_kind = 'request' and jsonb_array_length(p_travellers) > 0 then
    insert into public.trip_travellers (
      trip_id, first_name, age_band, medical_notes, sort_order
    )
    select
      v_trip_id,
      nullif(t ->> 'first_name', ''),
      nullif(t ->> 'age_band', ''),
      nullif(t ->> 'medical_notes', ''),
      (i - 1)::int
    from jsonb_array_elements(p_travellers) with ordinality as x(t, i);
    -- If any row violates the age_band CHECK constraint or RLS, the
    -- whole function aborts and the trip insert above rolls back.
  end if;

  return v_trip_id;
end;
$$;

-- Restrict EXECUTE to authenticated users. Anon cannot create trips.
revoke all on function public.create_trip_with_travellers(
  text, text[], date, text, text[], text[], text, text[], int, text, jsonb
) from public;

grant execute on function public.create_trip_with_travellers(
  text, text[], date, text, text[], text[], text, text[], int, text, jsonb
) to authenticated;
