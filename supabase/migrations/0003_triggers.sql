-- 0003_triggers.sql
-- Core triggers:
--   1. on_auth_user_created  → inserts matching profiles row on signup.
--   2. on_match_request_accepted → creates matches row + auto-declines siblings + flips trip to 'matched'.
--   3. on_match_completion_both  → flips matches.status to 'completed' when both sides mark done.
--   4. on_verification_from_identity → auto-creates verifications rows for linked OAuth identities.

-- ---------------------------------------------------------------------------
-- 1. Profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   text  := coalesce(meta->>'role', 'companion');
  v_lang   text  := coalesce(meta->>'primary_language', 'English');
  v_name   text  := coalesce(meta->>'display_name', meta->>'full_name', split_part(coalesce(new.email, ''), '@', 1));
begin
  if v_role not in ('family','companion') then
    v_role := 'companion';
  end if;

  insert into public.profiles (id, role, display_name, full_name, photo_url, languages, primary_language)
  values (
    new.id,
    v_role,
    v_name,
    meta->>'full_name',
    meta->>'avatar_url',
    array[v_lang]::text[],
    v_lang
  )
  on conflict (id) do nothing;

  -- Email is automatically verified for email+password / magic link signups.
  if new.email is not null and new.email_confirmed_at is not null then
    insert into public.verifications (user_id, channel, handle, verified_at)
    values (new.id, 'email', new.email, new.email_confirmed_at)
    on conflict (user_id, channel) do update
      set handle = excluded.handle,
          verified_at = excluded.verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Match acceptance flow
-- ---------------------------------------------------------------------------
create or replace function public.handle_match_request_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  if old.status = new.status or new.status <> 'accepted' then
    return new;
  end if;

  select user_id into v_poster from public.trips where id = new.trip_id;

  -- Create the match row.
  insert into public.matches (match_request_id, trip_id, poster_id, requester_id, status)
  values (new.id, new.trip_id, v_poster, new.requester_id, 'active')
  on conflict (match_request_id) do nothing;

  -- Flip the trip to matched.
  update public.trips set status = 'matched' where id = new.trip_id and status = 'open';

  -- Auto-decline sibling requests with a polite-status enum.
  update public.match_requests
     set status = 'auto_declined', responded_at = now()
   where trip_id = new.trip_id
     and id <> new.id
     and status = 'pending';

  -- Stamp response time on the accepted one.
  new.responded_at := now();
  return new;
end;
$$;

drop trigger if exists on_match_request_accepted on public.match_requests;
create trigger on_match_request_accepted
  before update of status on public.match_requests
  for each row execute function public.handle_match_request_accepted();

-- Handle explicit decline: just stamp responded_at.
create or replace function public.handle_match_request_declined()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'declined' and old.status <> 'declined' then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_match_request_declined on public.match_requests;
create trigger on_match_request_declined
  before update of status on public.match_requests
  for each row execute function public.handle_match_request_declined();

-- ---------------------------------------------------------------------------
-- 3. Trip completion when both flags flip
-- ---------------------------------------------------------------------------
create or replace function public.handle_match_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.poster_marked_complete and new.requester_marked_complete and new.status = 'active' then
    new.status := 'completed';
    new.completed_at := now();
    update public.trips set status = 'completed' where id = new.trip_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_match_completion on public.matches;
create trigger on_match_completion
  before update of poster_marked_complete, requester_marked_complete on public.matches
  for each row execute function public.handle_match_completion();

-- ---------------------------------------------------------------------------
-- 4. Verification badges from OAuth identities
-- ---------------------------------------------------------------------------
-- When a user links a LinkedIn / Twitter / Google identity, Supabase writes to
-- auth.identities. We reflect it as a verification row so the badge shows up.
create or replace function public.handle_identity_linked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
  v_handle  text;
begin
  v_channel := case new.provider
    when 'linkedin_oidc' then 'linkedin'
    when 'linkedin'      then 'linkedin'
    when 'twitter'       then 'twitter'
    else null
  end;
  if v_channel is null then
    return new;
  end if;

  v_handle := coalesce(
    new.identity_data->>'preferred_username',
    new.identity_data->>'user_name',
    new.identity_data->>'username',
    new.identity_data->>'email'
  );

  insert into public.verifications (user_id, channel, handle, verified_at, proof)
  values (new.user_id, v_channel, v_handle, now(), new.identity_data)
  on conflict (user_id, channel) do update
    set handle = excluded.handle,
        verified_at = excluded.verified_at,
        proof = excluded.proof;

  return new;
end;
$$;

drop trigger if exists on_identity_linked on auth.identities;
create trigger on_identity_linked
  after insert or update on auth.identities
  for each row execute function public.handle_identity_linked();
