-- 0024_drop_auth_shim.sql
-- Remove the transient Supabase-auth shim created in 0000_bootstrap.sql.
--
-- Safe to drop here because:
--   * 0005_clerk.sql dropped both triggers on auth.* (on_auth_user_created,
--     on_identity_linked) and rebuilt every public table that FK'd into
--     auth.users WITHOUT that FK.
--   * Migrations 0006..0023 never reference auth.* — they use
--     public.clerk_user_id() exclusively.
--
-- After this migration, the database has no `auth` schema and no objects
-- from the shim — a clean vanilla-Postgres end state.

drop schema if exists auth cascade;
