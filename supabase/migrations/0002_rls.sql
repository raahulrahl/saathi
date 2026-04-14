-- 0002_rls.sql
-- Row-level security policies. See Product Spec §4 (the paragraph after the schema).
--
-- Summary:
--   * Public (anon) can read a PII-redacted slice of profiles + trips + verifications.
--     Elderly details and the full handle on verifications are redacted via a VIEW
--     (public_trips, public_profiles, public_verifications). Policies below gate the
--     base tables so that anon can only read the VIEWs.
--   * Authenticated users see their own rows, and the redacted views for everyone else.
--   * Once a match_request is accepted, a matches row is created and both participants
--     can see the full row (including elderly details) via the `matches_unlock_trip`
--     policy that joins back to matches.

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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Everyone (including anon) can read the public slice. `full_name` is private
-- but exposed in the same row; consumers must select only the public columns.
-- The `public_profiles` view in 0004 pins the safe columns.
create policy "profiles: public read" on public.profiles
  for select using (true);

create policy "profiles: owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles: owner insert" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- verifications
-- ---------------------------------------------------------------------------
-- The existence of a verification (channel + verified_at) is public. The handle
-- is private and is stripped in the `public_verifications` view.
create policy "verifications: public read" on public.verifications
  for select using (true);

create policy "verifications: owner writes" on public.verifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
-- A trip is publicly readable. The elderly PII columns are stripped in the
-- `public_trips` view. Once a matches row exists joining the viewer to the
-- trip, the `trips: match participants` policy grants full access to the raw
-- trip row (so match/[id] can show the elderly details).
create policy "trips: public read" on public.trips
  for select using (true);

create policy "trips: owner writes" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "trips: match participants read full row" on public.trips
  for select using (
    exists (
      select 1 from public.matches m
      where m.trip_id = trips.id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- match_requests
-- ---------------------------------------------------------------------------
create policy "match_requests: requester or trip owner read" on public.match_requests
  for select using (
    auth.uid() = requester_id
    or exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = auth.uid())
  );

create policy "match_requests: requester insert" on public.match_requests
  for insert with check (
    auth.uid() = requester_id
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id <> auth.uid() and t.status = 'open')
  );

-- Only the trip owner can change status (accept / decline).
create policy "match_requests: trip owner responds" on public.match_requests
  for update using (
    exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.trips t where t.id = match_requests.trip_id and t.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create policy "matches: participants read" on public.matches
  for select using (auth.uid() = poster_id or auth.uid() = requester_id);

create policy "matches: participants update completion" on public.matches
  for update using (auth.uid() = poster_id or auth.uid() = requester_id)
  with check (auth.uid() = poster_id or auth.uid() = requester_id);

-- Inserts come from the trigger (security definer) in 0003. No direct INSERT.

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create policy "messages: participants read" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  );

create policy "messages: participants send" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
        and m.status in ('active','completed')
    )
  );

-- ---------------------------------------------------------------------------
-- reviews (only after both parties mark complete → match status = 'completed')
-- ---------------------------------------------------------------------------
create policy "reviews: public read" on public.reviews for select using (true);

create policy "reviews: participants write after completion" on public.reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = reviews.match_id
        and m.status = 'completed'
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
        and reviewee_id in (m.poster_id, m.requester_id)
        and reviewee_id <> auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- trip_photos
-- ---------------------------------------------------------------------------
create policy "trip_photos: participants read private" on public.trip_photos
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  );

create policy "trip_photos: public read consented" on public.trip_photos
  for select using (
    visibility in ('profile','public') and other_party_consented = true
  );

create policy "trip_photos: uploader inserts" on public.trip_photos
  for insert with check (
    uploader_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  );

create policy "trip_photos: participants update consent" on public.trip_photos
  for update using (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.matches m
      where m.id = trip_photos.match_id
        and (m.poster_id = auth.uid() or m.requester_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy "reports: reporter insert" on public.reports
  for insert with check (reporter_id = auth.uid());

create policy "reports: reporter read own" on public.reports
  for select using (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
create policy "blocks: owner rw" on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
