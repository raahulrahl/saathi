-- 0001_init.sql
-- Saathi core schema. See Product Spec §4.
--
-- Design notes:
--   * auth.users is owned by Supabase Auth; we never insert into it directly.
--     A trigger in 0003_triggers.sql populates `profiles` when a new auth user
--     is created.
--   * `trips` is a single table for both requests and offers; distinguished by
--     the `kind` column. The elderly-traveller fields are only populated when
--     kind = 'request'.
--   * A match_request becomes a match only on accept; sibling requests are
--     auto-declined by a trigger in 0003_triggers.sql.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  role             text not null check (role in ('family','companion')),
  display_name     text,
  full_name        text,
  photo_url        text,
  bio              text,
  languages        text[] not null default '{}',
  primary_language text not null,
  gender           text check (gender in ('male','female','nonbinary','prefer_not_to_say') or gender is null),
  created_at       timestamptz not null default now(),
  constraint languages_nonempty check (array_length(languages, 1) >= 1)
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_languages_gin on public.profiles using gin (languages);

-- ---------------------------------------------------------------------------
-- verifications (one row per channel per user)
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in ('linkedin','twitter','email','whatsapp')),
  handle      text,
  verified_at timestamptz,
  proof       jsonb,
  unique (user_id, channel)
);

create index if not exists verifications_user_idx on public.verifications(user_id);

-- ---------------------------------------------------------------------------
-- trips (requests + offers)
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
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

-- Fast lookup by origin / destination for the search page.
create index if not exists trips_origin_idx on public.trips((route[1]));
create index if not exists trips_dest_idx on public.trips((route[array_length(route,1)]));
create index if not exists trips_date_idx on public.trips(travel_date);
create index if not exists trips_status_idx on public.trips(status);
create index if not exists trips_kind_status_idx on public.trips(kind, status);
create index if not exists trips_languages_gin on public.trips using gin (languages);

-- ---------------------------------------------------------------------------
-- match_requests
-- ---------------------------------------------------------------------------
create table if not exists public.match_requests (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  intro_message text,
  status        text not null check (status in ('pending','accepted','declined','auto_declined')) default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (trip_id, requester_id)
);

create index if not exists match_requests_trip_idx on public.match_requests(trip_id);
create index if not exists match_requests_requester_idx on public.match_requests(requester_id);
create index if not exists match_requests_status_idx on public.match_requests(status);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id                         uuid primary key default gen_random_uuid(),
  match_request_id           uuid not null references public.match_requests(id) on delete cascade,
  trip_id                    uuid not null references public.trips(id) on delete cascade,
  poster_id                  uuid not null references public.profiles(id) on delete cascade,
  requester_id               uuid not null references public.profiles(id) on delete cascade,
  status                     text not null check (status in ('active','completed','cancelled','disputed')) default 'active',
  poster_marked_complete     boolean not null default false,
  requester_marked_complete  boolean not null default false,
  created_at                 timestamptz not null default now(),
  completed_at               timestamptz,
  unique (match_request_id)
);

create index if not exists matches_trip_idx on public.matches(trip_id);
create index if not exists matches_poster_idx on public.matches(poster_id);
create index if not exists matches_requester_idx on public.matches(requester_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_idx on public.messages(match_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (match_id, reviewer_id)
);

create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);

-- ---------------------------------------------------------------------------
-- trip_photos
-- ---------------------------------------------------------------------------
create table if not exists public.trip_photos (
  id                     uuid primary key default gen_random_uuid(),
  match_id               uuid not null references public.matches(id) on delete cascade,
  uploader_id            uuid not null references public.profiles(id) on delete cascade,
  photo_url              text not null,
  caption                text,
  visibility             text not null check (visibility in ('private','profile','public')) default 'private',
  other_party_consented  boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists trip_photos_match_idx on public.trip_photos(match_id);
create index if not exists trip_photos_visibility_idx on public.trip_photos(visibility);

-- ---------------------------------------------------------------------------
-- reports (trust & safety)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  reason       text not null,
  context      jsonb,
  status       text not null check (status in ('open','reviewing','actioned','dismissed')) default 'open',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- blocks (block-list per user)
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
