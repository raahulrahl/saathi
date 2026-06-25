-- 0023_onboarding_complete.sql
--
-- Add an explicit `onboarding_complete` flag to profiles. Closes
-- bug L02.
--
-- Without this, a user who signs up via Clerk but bounces before
-- finishing onboarding gets a profile row stamped with role='companion'
-- (the webhook's hard-coded default) and no real languages, no bio,
-- no WhatsApp number. They look like a real user in admin/analytics
-- views, distorting the funnel and role distribution.
--
-- The flag flips to true in the saveOnboardingProfile action after
-- all required fields land. Queries that want "actually onboarded
-- users" can now filter on this column explicitly.

alter table public.profiles
  add column if not exists onboarding_complete boolean not null default false;

-- Index it — analytics + admin queries will filter on it, and the
-- column's selectivity is high (either/or split across the full user
-- base).
create index if not exists profiles_onboarding_complete_idx
  on public.profiles (onboarding_complete);
