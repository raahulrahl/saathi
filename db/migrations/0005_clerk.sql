-- 0005_clerk.sql
-- Migrate the data layer from Supabase Auth to Clerk.
--
-- Why: Product decision to use Clerk for auth while Supabase remains the DB.
-- Clerk mints a JWT (via a "supabase" JWT template in the Clerk dashboard)
-- signed with Supabase's JWT secret; Supabase accepts it transparently. Our
-- RLS policies continue to work, but the user identifier format changes
-- because Clerk user IDs are strings like `user_2abc...`, not UUIDs.
--
-- What this migration does, safely and idempotently:
--   1. Drops the old auth-schema triggers (they never fire under Clerk).
--   2. Drops all public tables that FK'd into auth.users(id).
--   3. Recreates every table with `text` primary keys for user references.
--   4. Adds `public.clerk_user_id()` helper returning the `sub` claim as text.
--   5. Reapplies every RLS policy, re-keyed on `public.clerk_user_id()`.
--   6. Recreates views and the remaining triggers (match flow + completion).
--
-- Safe-by-nuke: this migration assumes no production user data yet. Running
-- it against a loaded DB will cascade-drop every row.

-- ---------------------------------------------------------------------------
-- 1. Drop old auth-schema triggers + functions
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

drop trigger if exists on_identity_linked on auth.identities;
drop function if exists public.handle_identity_linked() cascade;

-- ---------------------------------------------------------------------------
-- 2. Drop public tables (cascade via profiles to everything downstream)
-- ---------------------------------------------------------------------------
drop view if exists public.public_profiles;
drop view if exists public.public_verifications;
drop view if exists public.public_trips;
drop view if exists public.profile_review_stats;

drop table if exists public.reviews cascade;
drop table if exists public.trip_photos cascade;
drop table if exists public.messages cascade;
drop table if exists public.matches cascade;
drop table if exists public.match_requests cascade;
drop table if exists public.trips cascade;
drop table if exists public.verifications cascade;
drop table if exists public.reports cascade;
drop table if exists public.blocks cascade;
drop table if exists public.profiles cascade;

-- Drop the remaining function stubs left by 0003 (they'll be recreated).
drop function if exists public.handle_match_request_accepted() cascade;
drop function if exists public.handle_match_request_declined() cascade;
drop function if exists public.handle_match_completion() cascade;

-- ---------------------------------------------------------------------------
-- 3. Clerk-aware helper. Returns the Clerk user id from the JWT as text.
--    Lives in `public`, not `auth`: Supabase Cloud locks down the auth schema,
--    so user-defined functions there fail with SQLSTATE 42501. `auth.uid()`
--    would also cast `sub` to uuid and fail for Clerk ids like `user_2abc…`.
-- ---------------------------------------------------------------------------
create or replace function public.clerk_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      #>> '{app_metadata,clerk_user_id}'
  );
$$;

grant execute on function public.clerk_user_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Tables, now keyed on text user ids from Clerk
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               text primary key,         -- Clerk user id
  role             text not null check (role in ('family','companion')),
  display_name     text,
  full_name        text,
  photo_url        text,
  bio              text,
  languages        text[] not null default '{}',
  primary_language text not null,
  gender           text check (gender in ('male','female','nonbinary','prefer_not_to_say') or gender is null),
  email            text,
  created_at       timestamptz not null default now(),
  constraint languages_nonempty check (array_length(languages, 1) >= 1)
);

create index profiles_role_idx on public.profiles(role);
create index profiles_languages_gin on public.profiles using gin (languages);

create table public.verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in ('linkedin','twitter','email','whatsapp','google','github')),
  handle      text,
  verified_at timestamptz,
  proof       jsonb,
  unique (user_id, channel)
);

create index verifications_user_idx on public.verifications(user_id);

create table public.trips (
  id                     uuid primary key default gen_random_uuid(),
  user_id                text not null references public.profiles(id) on delete cascade,
  kind                   text not null check (kind in ('request','offer')),
  route                  text[] not null check (array_length(route, 1) >= 2),
  travel_date            date not null,
  flight_numbers         text[],
  airline                text,
  languages              text[] not null default '{}',
  gender_preference      text check (gender_preference in ('any','male','female')) default 'any',
  help_categories        text[] not null default '{}',
  thank_you_eur          int check (thank_you_eur is null or thank_you_eur >= 0),
  notes                  text,
  status                 text not null check (status in ('open','matched','completed','cancelled')) default 'open',
  elderly_first_name     text,
  elderly_age_band       text check (elderly_age_band in ('60-70','70-80','80+') or elderly_age_band is null),
  elderly_photo_url      text,
  elderly_medical_notes  text,
  created_at             timestamptz not null default now(),
  constraint elderly_only_on_request check (
    kind = 'request'
    or (
      elderly_first_name is null
      and elderly_age_band is null
      and elderly_photo_url is null
      and elderly_medical_notes is null
    )
  )
);

create index trips_origin_idx on public.trips((route[1]));
create index trips_dest_idx on public.trips((route[array_length(route,1)]));
create index trips_date_idx on public.trips(travel_date);
create index trips_status_idx on public.trips(status);
create index trips_kind_status_idx on public.trips(kind, status);
create index trips_languages_gin on public.trips using gin (languages);

create table public.match_requests (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  requester_id  text not null references public.profiles(id) on delete cascade,
  intro_message text,
  status        text not null check (status in ('pending','accepted','declined','auto_declined')) default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (trip_id, requester_id)
);

create index match_requests_trip_idx on public.match_requests(trip_id);
create index match_requests_requester_idx on public.match_requests(requester_id);
create index match_requests_status_idx on public.match_requests(status);

create table public.matches (
  id                         uuid primary key default gen_random_uuid(),
  match_request_id           uuid not null references public.match_requests(id) on delete cascade,
  trip_id                    uuid not null references public.trips(id) on delete cascade,
  poster_id                  text not null references public.profiles(id) on delete cascade,
  requester_id               text not null references public.profiles(id) on delete cascade,
  status                     text not null check (status in ('active','completed','cancelled','disputed')) default 'active',
  poster_marked_complete     boolean not null default false,
  requester_marked_complete  boolean not null default false,
  created_at                 timestamptz not null default now(),
  completed_at               timestamptz,
  unique (match_request_id)
);

create index matches_trip_idx on public.matches(trip_id);
create index matches_poster_idx on public.matches(poster_id);
create index matches_requester_idx on public.matches(requester_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  sender_id  text not null references public.profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_match_idx on public.messages(match_id, created_at desc);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  reviewer_id text not null references public.profiles(id) on delete cascade,
  reviewee_id text not null references public.profiles(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (match_id, reviewer_id)
);

create index reviews_reviewee_idx on public.reviews(reviewee_id);

create table public.trip_photos (
  id                     uuid primary key default gen_random_uuid(),
  match_id               uuid not null references public.matches(id) on delete cascade,
  uploader_id            text not null references public.profiles(id) on delete cascade,
  photo_url              text not null,
  caption                text,
  visibility             text not null check (visibility in ('private','profile','public')) default 'private',
  other_party_consented  boolean not null default false,
  created_at             timestamptz not null default now()
);

create index trip_photos_match_idx on public.trip_photos(match_id);
create index trip_photos_visibility_idx on public.trip_photos(visibility);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  text not null references public.profiles(id) on delete cascade,
  subject_id   text not null references public.profiles(id) on delete cascade,
  reason       text not null,
  context      jsonb,
  status       text not null check (status in ('open','reviewing','actioned','dismissed')) default 'open',
  created_at   timestamptz not null default now()
);

create table public.blocks (
  blocker_id text not null references public.profiles(id) on delete cascade,
  blocked_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- 5. RLS — same intent as 0002_rls.sql, re-keyed to public.clerk_user_id()
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.verifications    enable row level security;
alter table public.trips            enable row level security;
alter table public.match_requests   enable row level security;
alter table public.matches          enable row level security;
alter table public.messages         enable row level security;
alter table public.reviews          enable row level security;
alter table public.trip_photos      enable row level security;
alter table public.reports          enable row level security;
alter table public.blocks           enable row level security;

-- profiles: public read of the row; the public_profiles view strips PII
create policy "profiles: public read" on public.profiles for select using (true);
create policy "profiles: owner update" on public.profiles
  for update using (public.clerk_user_id() = id) with check (public.clerk_user_id() = id);
-- Inserts come from the service-role webhook. No anon/auth insert policy.

-- verifications: existence public; handle stripped in the view
create policy "verifications: public read" on public.verifications for select using (true);
create policy "verifications: owner writes" on public.verifications
  for all using (public.clerk_user_id() = user_id) with check (public.clerk_user_id() = user_id);

-- trips: public read of whole row; public_trips view strips elderly PII
create policy "trips: public read" on public.trips for select using (true);
create policy "trips: owner writes" on public.trips
  for all using (public.clerk_user_id() = user_id) with check (public.clerk_user_id() = user_id);
create policy "trips: match participants read full row" on public.trips
  for select using (
    exists (
      select 1 from public.matches m
      where m.trip_id = trips.id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  );

-- match_requests
create policy "match_requests: requester or trip owner read" on public.match_requests
  for select using (
    public.clerk_user_id() = requester_id
    or exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = public.clerk_user_id())
  );

create policy "match_requests: requester insert" on public.match_requests
  for insert with check (
    public.clerk_user_id() = requester_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and t.user_id <> public.clerk_user_id()
        and t.status = 'open'
    )
  );

create policy "match_requests: trip owner responds" on public.match_requests
  for update using (
    exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = public.clerk_user_id())
  ) with check (
    exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = public.clerk_user_id())
  );

-- matches
create policy "matches: participants read" on public.matches
  for select using (public.clerk_user_id() = poster_id or public.clerk_user_id() = requester_id);
create policy "matches: participants update completion" on public.matches
  for update using (public.clerk_user_id() = poster_id or public.clerk_user_id() = requester_id)
  with check (public.clerk_user_id() = poster_id or public.clerk_user_id() = requester_id);

-- messages
create policy "messages: participants read" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  );
create policy "messages: participants send" on public.messages
  for insert with check (
    sender_id = public.clerk_user_id()
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
        and m.status in ('active','completed')
    )
  );

-- reviews
create policy "reviews: public read" on public.reviews for select using (true);
create policy "reviews: participants write after completion" on public.reviews
  for insert with check (
    reviewer_id = public.clerk_user_id()
    and exists (
      select 1 from public.matches m
      where m.id = reviews.match_id
        and m.status = 'completed'
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
        and reviewee_id in (m.poster_id, m.requester_id)
        and reviewee_id <> public.clerk_user_id()
    )
  );

-- trip_photos
create policy "trip_photos: participants read private" on public.trip_photos
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  );
create policy "trip_photos: public read consented" on public.trip_photos
  for select using (visibility in ('profile','public') and other_party_consented = true);
create policy "trip_photos: uploader inserts" on public.trip_photos
  for insert with check (
    uploader_id = public.clerk_user_id()
    and exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  );
create policy "trip_photos: participants update consent" on public.trip_photos
  for update using (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  ) with check (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
    )
  );

-- reports
create policy "reports: reporter insert" on public.reports
  for insert with check (reporter_id = public.clerk_user_id());
create policy "reports: reporter read own" on public.reports
  for select using (reporter_id = public.clerk_user_id());

-- blocks
create policy "blocks: owner rw" on public.blocks
  for all using (blocker_id = public.clerk_user_id()) with check (blocker_id = public.clerk_user_id());

-- ---------------------------------------------------------------------------
-- 6. Match-flow triggers (unchanged behaviour, same function bodies)
-- ---------------------------------------------------------------------------
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

  select user_id into v_poster from public.trips where id = new.trip_id;

  insert into public.matches (match_request_id, trip_id, poster_id, requester_id, status)
  values (new.id, new.trip_id, v_poster, new.requester_id, 'active')
  on conflict (match_request_id) do nothing;

  update public.trips set status = 'matched' where id = new.trip_id and status = 'open';

  update public.match_requests
     set status = 'auto_declined', responded_at = now()
   where trip_id = new.trip_id
     and id <> new.id
     and status = 'pending';

  new.responded_at := now();
  return new;
end;
$$;

drop trigger if exists on_match_request_accepted on public.match_requests;
create trigger on_match_request_accepted
  before update of status on public.match_requests
  for each row execute function public.handle_match_request_accepted();

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
-- 7. Public views (PII-redacted)
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles
with (security_invoker = true) as
select
  p.id,
  p.role,
  p.display_name,
  p.photo_url,
  p.bio,
  p.languages,
  p.primary_language,
  p.gender,
  p.created_at,
  (select count(*) from public.verifications v
    where v.user_id = p.id and v.verified_at is not null) as verified_channel_count
from public.profiles p;

create or replace view public.public_verifications
with (security_invoker = true) as
select v.user_id, v.channel, v.verified_at
from public.verifications v
where v.verified_at is not null;

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
  t.created_at
from public.trips t;

create or replace view public.profile_review_stats
with (security_invoker = true) as
select
  reviewee_id as user_id,
  count(*)::int as review_count,
  round(avg(rating)::numeric, 2) as average_rating
from public.reviews
group by reviewee_id;

grant select on public.public_profiles       to anon, authenticated;
grant select on public.public_verifications  to anon, authenticated;
grant select on public.public_trips          to anon, authenticated;
grant select on public.profile_review_stats  to anon, authenticated;
