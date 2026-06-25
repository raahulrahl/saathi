-- 0015_trip_travellers_match_read.sql
--
-- Fix for bugs/01-trip-travellers-rls.md.
--
-- Problem: trip_travellers has one RLS policy — the "owner full access"
-- one carried over from the original 0013 migration — which grants
-- SELECT only to the trip owner (family). The matched companion, who
-- needs to see the traveller's name and notes to actually provide help,
-- gets an empty result from `SELECT * FROM trip_travellers` because
-- they don't satisfy `trips.user_id = clerk_user_id()`.
--
-- Fix: add a SECOND select-only policy granting access to anyone on an
-- active or completed `matches` row for the trip. Postgres RLS is
-- permissive (policies OR together) — this widens reads without
-- affecting the owner's write path.
--
-- We key on `matches`, not `match_requests.status = 'accepted'`, because
-- a match_request is promoted to a `matches` row by the trigger in
-- 0005_clerk.sql only on accept. Presence of the matches row is the
-- authoritative "this pairing is real" signal.

create policy "trip_travellers: match participants read"
  on public.trip_travellers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.trip_id = trip_travellers.trip_id
        and (m.poster_id = public.clerk_user_id()
             or m.requester_id = public.clerk_user_id())
    )
  );
