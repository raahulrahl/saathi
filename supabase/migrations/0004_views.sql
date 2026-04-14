-- 0004_views.sql
-- Public, PII-redacted views. Anonymous visitors should query these, not the
-- base tables. See Product Spec §4.

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
  -- Count of verified channels, rendered as badges on the card.
  (select count(*) from public.verifications v where v.user_id = p.id and v.verified_at is not null) as verified_channel_count
from public.profiles p;

create or replace view public.public_verifications
with (security_invoker = true) as
select
  v.user_id,
  v.channel,
  v.verified_at
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
  t.elderly_age_band,            -- age band is OK to show publicly
  -- Redacted columns: elderly_first_name, elderly_photo_url, elderly_medical_notes,
  -- flight_numbers are hidden from the public view.
  t.created_at
from public.trips t;

-- Aggregate review stats used on profile cards.
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
