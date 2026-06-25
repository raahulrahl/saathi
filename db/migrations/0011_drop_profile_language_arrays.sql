-- 0011_drop_profile_language_arrays.sql
-- Finish the profile-language normalisation started in 0009.
--
-- 0009 created profile_languages and set up a dual-write: saveOnboardingProfile
-- wrote to BOTH profiles.languages[] (denormalised cache) and profile_languages
-- (join table). Every read still hit the cache. That worked as a transitional
-- state but has the usual dual-write hazards: the two sources of truth can
-- drift, and "which one is authoritative?" depends on who you ask.
--
-- This migration flips profile_languages from "cache-next-to" to "only source":
--
--   1. Rebuild public_profiles so `languages` and `primary_language` are
--      derived via subqueries on profile_languages — same JSON shape, so
--      no downstream consumer needs to change.
--   2. Drop profiles.languages, profiles.primary_language, the GIN index on
--      the array column, and the languages_nonempty check. These are all
--      dead once the view stops referencing them.
--
-- App code (clerk-sync, webhook, onboarding server action) stops seeding
-- and writing the array columns in the same commit — see git diff alongside.

-- ---------------------------------------------------------------------------
-- 1. Rebuild public_profiles view with derived languages / primary_language
-- ---------------------------------------------------------------------------
-- Column order MUST match 0009's view exactly. CREATE OR REPLACE VIEW only
-- allows adding columns at the end — it can't reorder, rename, or change
-- the type of an existing column position. Hence languages + primary_language
-- stay at positions 6 and 7; only their definitions swap from `p.<col>`
-- to a derived subquery on profile_languages.
--
-- Using scalar subqueries (one per column) rather than lateral joins because
-- there are only two language-derived columns; a JOIN would make us carry the
-- rest of the SELECT list through a GROUP BY. Subqueries are executed once
-- per row and the query planner hoists the profile_languages seq-scan out,
-- so this reads cleanly and performs fine at our scale.
create or replace view public.public_profiles
with (security_invoker = true) as
select
  p.id,
  p.role,
  p.display_name,
  p.photo_url,
  p.bio,
  -- All languages for this profile, primary first, then alphabetical.
  -- Deterministic ordering keeps card rendering stable across fetches.
  coalesce(
    (select array_agg(pl.language order by pl.is_primary desc, pl.language)
       from public.profile_languages pl
      where pl.profile_id = p.id),
    '{}'::text[]
  ) as languages,
  -- The one flagged primary, or null if they haven't onboarded yet.
  (select pl.language
     from public.profile_languages pl
    where pl.profile_id = p.id
      and pl.is_primary
    limit 1) as primary_language,
  p.created_at,
  p.updated_at,
  p.is_active,
  p.linkedin_url,
  p.facebook_url,
  p.twitter_url,
  p.instagram_url
from public.profiles p
where p.is_active = true;

grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the now-dead array columns + their constraints
-- ---------------------------------------------------------------------------
-- Check constraint first — dropping it by name is idempotent via IF EXISTS,
-- and we need it gone before the column drop because the constraint
-- references the column.
alter table public.profiles
  drop constraint if exists languages_nonempty;

-- GIN index on the text[] column. Postgres would drop it automatically with
-- the column but being explicit surfaces the removal in the diff.
drop index if exists public.profiles_languages_gin;

alter table public.profiles
  drop column if exists languages,
  drop column if exists primary_language;

-- NB: trips.languages (different column, different table — "languages this
-- trip can help in") stays. That's per-trip scope and has its own GIN index
-- (trips_languages_gin) that is unaffected.
