-- 0019_blocks_enforcement.sql
--
-- Make the `blocks` table actually do something. Before this migration
-- a user could block someone and have the block silently ignored — the
-- blocked user could still send match_requests on the blocker's trips
-- and message them once matched. Closes bug M07.
--
-- Semantic: blocks are symmetric at the enforcement layer. If either
-- party has blocked the other, they can't send new match_requests or
-- new messages. Pre-existing matches + messages stay readable (we don't
-- retroactively scrub conversations), but no new writes flow.
--
-- Policies replaced:
--   * match_requests: requester insert — add the block predicate.
--   * messages: participants send — add the block predicate.

-- ── match_requests: requester insert ───────────────────────────────────
drop policy if exists "match_requests: requester insert" on public.match_requests;

create policy "match_requests: requester insert"
  on public.match_requests
  for insert
  with check (
    public.clerk_user_id() = requester_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and t.user_id <> public.clerk_user_id()
        and t.status = 'open'
    )
    -- Block predicate: neither direction of block permits the insert.
    -- Using NOT EXISTS so an empty blocks table is a no-op (the
    -- subquery returns no rows, NOT EXISTS is true).
    and not exists (
      select 1 from public.blocks b
      join public.trips t on t.id = trip_id
      where (b.blocker_id = t.user_id      and b.blocked_id = public.clerk_user_id())
         or (b.blocker_id = public.clerk_user_id() and b.blocked_id = t.user_id)
    )
  );

-- ── messages: participants send ────────────────────────────────────────
drop policy if exists "messages: participants send" on public.messages;

create policy "messages: participants send"
  on public.messages
  for insert
  with check (
    sender_id = public.clerk_user_id()
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.poster_id = public.clerk_user_id() or m.requester_id = public.clerk_user_id())
        and m.status in ('active','completed')
    )
    -- Block predicate: if either participant has blocked the other,
    -- new messages are refused. The existing matches row stays, and
    -- historical messages stay readable — this only gates future writes.
    and not exists (
      select 1 from public.blocks b
      join public.matches m on m.id = messages.match_id
      where (b.blocker_id = m.poster_id    and b.blocked_id = m.requester_id)
         or (b.blocker_id = m.requester_id and b.blocked_id = m.poster_id)
    )
  );
