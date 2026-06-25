-- 0009_profile_schema_cleanup.sql
-- Schema review cleanup + profile_languages normalisation.
--
-- Context: critical schema review flagged several issues:
--   * no updated_at on profiles (can't audit, can't invalidate caches)
--   * no is_active / soft-delete (can't disable accounts non-destructively)
--   * languages stored as text[] on profiles — hard to search by language,
--     awkward to index for primary-vs-secondary, no per-language metadata
--   * verifications table is dead weight — we dropped the 2-of-N gate in
--     the onboarding simplification, nothing consumes the rows meaningfully
--   * whatsapp_number has no validation-status column — when Twilio Lookup
--     says the number is live we should record that
--   * gender and full_name columns exist but nothing uses them in the new
--     onboarding flow
--
-- This migration addresses all of the above in one pass. Non-destructive
-- for existing data where possible (we migrate languages into
-- profile_languages before dropping any writes). Dropping verifications
-- IS destructive (rows in that table are OAuth identity mirrors — if we
-- want them back later we can re-run the Clerk webhook to rebuild).

-- ---------------------------------------------------------------------------
-- 1. Add updated_at + is_active + whatsapp_validated_at to profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_active boolean not null default true,
  add column if not exists whatsapp_validated_at timestamptz;

-- Auto-bump updated_at on every row change. Generic function — can be
-- reused on other tables if we add them. security invoker since this
-- only modifies NEW, never reads.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Normalise languages into profile_languages
-- ---------------------------------------------------------------------------
-- Each row is one user ↔ language pairing. The primary language is
-- whichever row has is_primary = true. A partial unique index ensures
-- exactly zero-or-one primary per profile.
create table if not exists public.profile_languages (
  profile_id text not null references public.profiles(id) on delete cascade,
  language text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, language)
);

-- Searching "users who speak Bengali" is now a one-index lookup instead
-- of a GIN scan over text[].
create index if not exists profile_languages_language_idx
  on public.profile_languages (language);

create unique index if not exists profile_languages_one_primary_per_user
  on public.profile_languages (profile_id)
  where is_primary;

-- Owner writes, public reads (same pattern as profiles itself). The view
-- layer can still offer redacted access later if needed.
alter table public.profile_languages enable row level security;

drop policy if exists "profile_languages: public read" on public.profile_languages;
create policy "profile_languages: public read"
  on public.profile_languages
  for select
  using (true);

drop policy if exists "profile_languages: owner write" on public.profile_languages;
create policy "profile_languages: owner write"
  on public.profile_languages
  for all
  using (public.clerk_user_id() = profile_id)
  with check (public.clerk_user_id() = profile_id);

-- Backfill from the existing text[] column. Safe to re-run; pk + on
-- conflict do nothing prevents dupes.
insert into public.profile_languages (profile_id, language, is_primary)
select
  p.id,
  unnest(p.languages) as lang,
  false as is_primary
from public.profiles p
where p.languages is not null and array_length(p.languages, 1) >= 1
on conflict (profile_id, language) do nothing;

-- Mark the primary rows. Using an update here (not the insert above)
-- because unnest expansion can re-order and we want primary flipped
-- deterministically from profiles.primary_language.
update public.profile_languages pl
set is_primary = true
from public.profiles p
where pl.profile_id = p.id
  and pl.language = p.primary_language;

-- NOTE: we're keeping profiles.languages[] and profiles.primary_language
-- for now as a denormalised cache. The server action (saveOnboardingProfile)
-- writes to BOTH on save. Reads that need fast display (profile page,
-- trip card) can read the cache; reads that need actual search (matching,
-- "who speaks Bengali on this flight") should query profile_languages.
-- A follow-up migration can drop the array columns once all reads migrate.

-- ---------------------------------------------------------------------------
-- 3. Drop verifications + its view + the computed column on public_profiles
-- ---------------------------------------------------------------------------
-- Rationale: we removed the 2-of-N verification gate from posting,
-- the "verified N channels" badge is just clutter, and the Clerk webhook
-- keeps writing rows that nobody meaningfully reads. Dropping.
--
-- If we ever want trust signals back, the right home is a NEW small
-- table scoped to whatever signal actually matters (e.g. "clerk account
-- age", "completed trips") rather than mirroring OAuth identities.
drop view if exists public.public_verifications cascade;
drop table if exists public.verifications cascade;

-- Rebuild public_profiles without the verified_channel_count subquery
-- (the verifications table it referenced is gone). Also adds the four
-- social URL columns we've been meaning to expose.
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
  p.created_at,
  p.updated_at,
  p.is_active,
  p.linkedin_url,
  p.facebook_url,
  p.twitter_url,
  p.instagram_url
from public.profiles p
where p.is_active = true;  -- inactive profiles disappear from public views

grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Drop unused columns
-- ---------------------------------------------------------------------------
-- gender was collected by the old profile form but removed from the new
-- onboarding. Nothing reads it. Dropping.
-- full_name was similarly duplicated with display_name and never shown.
alter table public.profiles
  drop column if exists gender,
  drop column if exists full_name;
