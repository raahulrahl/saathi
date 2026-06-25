-- 0020_match_accept_race.sql
--
-- Fix the accept-race bug documented as M07→M06 in bugs/MEDIUM.md.
-- The previous handle_match_request_accepted:
--   1. INSERT INTO matches ...
--   2. UPDATE trips SET status='matched' WHERE ... AND status='open'
--   3. Sweep siblings
--
-- …lets two concurrent accepts both reach step 1, creating two active
-- matches on the same trip. The matches unique constraint only blocks
-- re-inserting the SAME match_request, not two different ones.
--
-- Fix: flip the order. Claim the trip FIRST with a first-write-wins
-- UPDATE and raise if zero rows were affected. Second accept sees
-- status='matched' (not 'open'), gets 0 rows, raises, and the BEFORE
-- UPDATE trigger aborts the match_requests update so that row stays
-- pending (or ends up auto_declined by the first accept's sibling
-- sweep, whichever commits first).

create or replace function public.handle_match_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster text;
begin
  if old.status = new.status or new.status <> 'accepted' then
    return new;
  end if;

  -- First-write-wins. Postgres row locks in READ COMMITTED mean a
  -- second concurrent UPDATE on this trip row blocks until the first
  -- commits, then re-evaluates WHERE and finds status='matched' →
  -- 0 rows → we raise, aborting the second accept cleanly.
  update public.trips
     set status = 'matched'
   where id = new.trip_id
     and status = 'open'
   returning user_id into v_poster;

  if not found then
    raise exception 'trip % is no longer open', new.trip_id
      using errcode = 'check_violation';
  end if;

  insert into public.matches (match_request_id, trip_id, poster_id, requester_id, status)
  values (new.id, new.trip_id, v_poster, new.requester_id, 'active')
  on conflict (match_request_id) do nothing;

  update public.match_requests
     set status = 'auto_declined', responded_at = now()
   where trip_id = new.trip_id
     and id <> new.id
     and status = 'pending';

  new.responded_at := now();
  return new;
end;
$$;

-- Trigger itself unchanged — same BEFORE UPDATE OF status on
-- match_requests — so no drop/create needed.
