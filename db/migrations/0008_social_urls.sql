-- 0008_social_urls.sql
-- Self-reported social profile URLs on public.profiles.
--
-- Context: the simplified onboarding (see 0007) asks users to paste
-- links to at least two of their social profiles (LinkedIn, Facebook,
-- Twitter/X, Instagram) so the public profile page has something to
-- show other travellers. These are NOT OAuth-verified — we just store
-- whatever URL the user pasted. The semantic is "here's where else I
-- exist on the internet," not "Clerk proved I own this account."
--
-- Kept as separate columns rather than a JSONB blob so:
--   * typed queries are easy (`select … where linkedin_url is not null`)
--   * schema is self-describing
--   * the public_profiles view can choose which to expose without
--     rewriting JSONB access patterns
--
-- OAuth-verified identities still live in public.verifications via the
-- Clerk webhook + self-heal. That table is a separate signal: "these
-- providers vouched for this account."

alter table public.profiles
  add column if not exists linkedin_url text,
  add column if not exists facebook_url text,
  add column if not exists twitter_url text,
  add column if not exists instagram_url text;

-- Light sanity check: either null, or starts with http(s)://. We don't
-- enforce per-provider hostnames because social platforms use many
-- domains (linkedin.com, lnkd.in; twitter.com, x.com; etc.) and we'd
-- rather accept a bad URL and show it inert than reject a real profile
-- because the user pasted a mobile-share link.
alter table public.profiles
  drop constraint if exists social_urls_http;

alter table public.profiles
  add constraint social_urls_http check (
    (linkedin_url  is null or linkedin_url  ~* '^https?://')
    and (facebook_url  is null or facebook_url  ~* '^https?://')
    and (twitter_url   is null or twitter_url   ~* '^https?://')
    and (instagram_url is null or instagram_url ~* '^https?://')
  );

-- Expose on the public_profiles view so profile pages can read them
-- via the anon key. These are public-by-intent — that's why the user
-- is entering them.
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
  (
    select count(*)
    from public.verifications v
    where v.user_id = p.id
      and v.verified_at is not null
  ) as verified_channel_count,
  p.linkedin_url,
  p.facebook_url,
  p.twitter_url,
  p.instagram_url
from public.profiles p;

grant select on public.public_profiles to anon, authenticated;
