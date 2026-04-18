-- 0018_rate_limits.sql
--
-- Lightweight per-user rate limiter backed by Postgres. Supports bug M01
-- (protects /api/flights/lookup from quota burn), designed generically so
-- any future route can reuse the same check.
--
-- Model: fixed-window, bucketed to the minute.
--   * primary key (user_id, endpoint, minute_bucket) lets us
--     `INSERT … ON CONFLICT DO UPDATE SET count = count + 1` and get the
--     post-increment count in a single round trip.
--   * A minute-aligned bucket is coarse on purpose — we don't need
--     sliding-window precision for "stop a script from hammering us",
--     and a minute is long enough that honest users never hit it.
--   * Old buckets can be swept by a daily job; for now they just sit
--     there. Storage is negligible (one row per active user per minute).

-- ── Table ──────────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  user_id        text         not null references public.profiles(id) on delete cascade,
  endpoint       text         not null,
  minute_bucket  timestamptz  not null,
  count          int          not null default 0,
  primary key (user_id, endpoint, minute_bucket)
);

-- GC helper — sweep old rows with a cron later if the table grows.
create index if not exists rate_limits_bucket_idx
  on public.rate_limits (minute_bucket);

-- ── RLS ────────────────────────────────────────────────────────────────
-- No direct reads or writes by application users. All access flows
-- through the check_rate_limit function below (security definer).
alter table public.rate_limits enable row level security;

-- ── Check + increment rpc ──────────────────────────────────────────────
-- Atomically:
--   1. Resolves the caller via public.clerk_user_id() — rejecting
--      anon, and preventing callers from passing someone else's id.
--   2. Increments the (user, endpoint, current-minute-bucket) count.
--   3. Returns true iff the post-increment count is within p_limit.
--
-- Caller should return 429 when this returns false.
create or replace function public.check_rate_limit(
  p_endpoint text,
  p_limit    int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       text := public.clerk_user_id();
  v_bucket        timestamptz := date_trunc('minute', now());
  v_current_count int;
begin
  if v_user_id is null then
    -- Authenticated routes should gate auth before calling this. Raising
    -- rather than returning false makes the misuse obvious in logs.
    raise exception 'check_rate_limit: not authenticated';
  end if;

  insert into public.rate_limits (user_id, endpoint, minute_bucket, count)
       values (v_user_id, p_endpoint, v_bucket, 1)
  on conflict (user_id, endpoint, minute_bucket)
       do update set count = rate_limits.count + 1
  returning count into v_current_count;

  return v_current_count <= p_limit;
end;
$$;

-- Service role can call it freely (for background jobs); authenticated
-- users can call it via the per-user Supabase client. anon can't.
revoke all on function public.check_rate_limit(text, int) from public;
grant execute on function public.check_rate_limit(text, int) to authenticated, service_role;
