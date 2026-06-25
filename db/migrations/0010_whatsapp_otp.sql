-- 0010_whatsapp_otp.sql
-- Supabase-backed WhatsApp OTP storage. Moves the OTP hash off Upstash
-- Redis and onto the profiles table.
--
-- Context: the app first used Twilio Verify (hit 68008 config errors),
-- then moved OTP logic to self-managed storage backed by Upstash Redis.
-- The Upstash token kept being the readonly variant (NOPERM evalsha,
-- NOPERM set) and generally added a failure point. Supabase is already
-- load-bearing for everything else, so we store the OTP hash there.
--
-- Two columns on profiles, both nullable:
--   whatsapp_otp_hash         — SHA-256(phone + ':' + code), the hash
--                               is stored not plaintext (same hygiene
--                               as the Redis version)
--   whatsapp_otp_expires_at   — 10 minutes after send; expired rows
--                               are treated as absent at check time
--
-- Cleanup happens in-flight: we blank both columns on successful
-- verify, failed verify, and on expiry-check. If a stale row somehow
-- lingers it's capped at 10 minutes by the expires_at logic; no cron
-- needed.
--
-- Why not a separate whatsapp_otps table? One user = at most one
-- pending OTP, so the cardinality matches profiles 1:1 and keeping
-- the transient state as two nullable columns on the owning row is
-- simpler than a new table + join. Trade-off is profile row gets one
-- more transient field — kept in check by always blanking on use.

alter table public.profiles
  add column if not exists whatsapp_otp_hash text,
  add column if not exists whatsapp_otp_expires_at timestamptz;

-- Sanity check: if hash is set, expires_at must be set too. If one
-- column is null the row is treated as "no pending OTP" so we want
-- them to stay in sync.
alter table public.profiles
  drop constraint if exists whatsapp_otp_paired;

alter table public.profiles
  add constraint whatsapp_otp_paired check (
    (whatsapp_otp_hash is null and whatsapp_otp_expires_at is null)
    or (whatsapp_otp_hash is not null and whatsapp_otp_expires_at is not null)
  );

-- No index — we only ever read these columns in a row we're already
-- fetching by primary key. If we add expired-OTP cleanup via cron we
-- can add a partial index on expires_at at that point.
