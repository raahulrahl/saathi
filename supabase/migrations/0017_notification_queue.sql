-- 0017_notification_queue.sql
--
-- Durable notification queue. Closes bugs M03 (fire-and-forget drops on
-- Vercel) and M04 (no notification dedupe).
--
-- Shape:
--   * One row per (new_trip, recipient, channel) — inserted by the
--     enqueue step in the trip-post server action.
--   * Dispatch worker picks rows up via FOR UPDATE SKIP LOCKED, groups
--     them by recipient, sends ONE digest email per recipient per
--     wake-up, respects a per-recipient cooldown so bursts don't
--     become inbox floods.
--   * Retries with attempts + next_attempt_at (exponential backoff).
--     Max 5 attempts, then status='failed' and the row stops polling.
--
-- Writer: service-role only. RLS denies everything else — users don't
-- need to see each other's pending notifications.

-- ── 1. Per-recipient cooldown anchor ────────────────────────────────────
-- last_notified_at on profiles lets the dispatch worker ask "has this
-- recipient been sent something in the last N minutes?" as a single
-- indexed lookup, without scanning pending_notifications history.
alter table public.profiles
  add column if not exists last_notified_at timestamptz;

-- ── 2. Queue table ──────────────────────────────────────────────────────
create table if not exists public.pending_notifications (
  id                 uuid primary key default gen_random_uuid(),

  -- The newly-posted trip that triggered the notification. Deleted when
  -- the trip is deleted — notifications for a deleted trip would be
  -- confusing to receive.
  new_trip_id        uuid not null references public.trips(id) on delete cascade,

  -- Who this notification is for — the owner of an existing open trip
  -- that matched `new_trip_id`.
  recipient_user_id  text not null references public.profiles(id) on delete cascade,

  -- 'email' today; 'whatsapp' when TWILIO_WHATSAPP_MATCH_CONTENT_SID
  -- is live. Split so cooldown + channel rate limits can diverge later
  -- without schema change.
  channel            text not null check (channel in ('email','whatsapp')),

  -- Snapshot of what to send. Captured at enqueue time so a poster
  -- editing their trip between enqueue and dispatch doesn't mutate the
  -- outbound content. Structure:
  --   { posterName, newTripKind, routeLabel, travelDate, flightNumbers, tripUrl }
  payload            jsonb not null,

  status             text not null
    check (status in ('pending','in_flight','sent','failed','skipped'))
    default 'pending',
  attempts           int  not null default 0,
  next_attempt_at    timestamptz not null default now(),
  last_error         text,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,

  -- Dedupe key. Same (trip, recipient, channel) cannot be enqueued twice,
  -- so a Server Action retry or a re-post of an identical trip cannot
  -- spam. ON CONFLICT DO NOTHING at the insert site relies on this.
  unique (new_trip_id, recipient_user_id, channel)
);

-- ── 3. Indexes for the worker query ────────────────────────────────────
-- The hot path: "give me the oldest pending rows whose next_attempt_at
-- has passed, FOR UPDATE SKIP LOCKED". Partial-index the pending rows
-- since sent/failed/skipped never needs scanning.
create index if not exists pending_notifications_pickup_idx
  on public.pending_notifications (next_attempt_at)
  where status = 'pending';

-- Aggregation path: group a recipient's pending rows. Secondary index
-- so the worker can resolve "all pending rows for recipient X" fast
-- after the initial pickup.
create index if not exists pending_notifications_recipient_idx
  on public.pending_notifications (recipient_user_id, status);

-- Queue-depth monitoring / debugging.
create index if not exists pending_notifications_trip_idx
  on public.pending_notifications (new_trip_id);

-- ── 4. RLS — service-role only ─────────────────────────────────────────
alter table public.pending_notifications enable row level security;

-- No read policy, no write policy. Service role bypasses RLS by design.
-- anon + authenticated get zero rows on any query, which is the intent:
-- the queue is infrastructure, not user-visible data.

-- ── 5. Documentation for operators (no code, just a comment) ───────────
comment on table public.pending_notifications is
  'Durable notification queue. Dispatch worker uses FOR UPDATE SKIP LOCKED. '
  'Per-recipient cooldown enforced via profiles.last_notified_at.';

comment on column public.pending_notifications.payload is
  'Snapshot of email/WhatsApp content at enqueue time. Avoids reading '
  'through the source trip at send time, which could have been edited.';

-- ── 6. Atomic claim function ───────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED is the standard Postgres queue pattern —
-- multiple concurrent workers grab different rows without contending
-- on a table-level lock. PostgREST doesn't expose this directly, so we
-- wrap it in an rpc the dispatch worker calls via supabase.rpc().
--
-- Claims at most `batch_size` pending rows whose next_attempt_at has
-- passed, flips them to 'in_flight', increments attempts, and returns
-- the full rows. A row reclaimed after a crash (status stuck at
-- 'in_flight' past the stuck_threshold) is also picked up so we don't
-- leak rows.
create or replace function public.claim_pending_notifications(
  batch_size int default 100,
  stuck_threshold interval default interval '5 minutes'
)
returns setof public.pending_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
      from public.pending_notifications
     where attempts < 5
       and (
         (status = 'pending' and next_attempt_at <= now())
         or (status = 'in_flight' and next_attempt_at <= now() - stuck_threshold)
       )
     order by next_attempt_at
     limit batch_size
     for update skip locked
  )
  update public.pending_notifications n
     set status      = 'in_flight',
         attempts    = n.attempts + 1
    from candidate c
   where n.id = c.id
   returning n.*;
end;
$$;

-- Service role only. anon / authenticated calling this would be a
-- privilege escalation.
revoke all on function public.claim_pending_notifications(int, interval) from public;
grant execute on function public.claim_pending_notifications(int, interval) to service_role;
