-- 0000_bootstrap.sql
-- Replicates the Supabase-managed baseline that migrations 0001..0023 silently
-- assume to exist: the anon/authenticated/service_role NOLOGIN roles, schema
-- privileges, default privileges so newly-created tables in `public` are
-- reachable by those roles, and a minimal `auth` schema shim so the
-- pre-Clerk migrations (0001..0004) can apply verbatim.
--
-- The `auth` shim is transient: 0005 drops all dependents (auth.users FK,
-- triggers on auth.users + auth.identities) and re-keys every policy onto
-- public.clerk_user_id(). 0024 then drops the schema entirely.
--
-- Idempotent. Run as the migration owner (raahuldutta locally; an equivalent
-- superuser in any other environment).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- These three roles are reached only via SET LOCAL ROLE from the app login
-- role (saathi_app). They have NOLOGIN; nobody connects as them directly.
-- NOINHERIT mirrors Supabase and makes the SET ROLE boundary explicit: a code
-- path that forgets to switch role gets no ambient privileges, so it fails
-- closed (permission denied) rather than silently bypassing RLS.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    -- BYPASSRLS is the entire point of service_role. It is a role attribute,
    -- so it is NOT inherited via role membership: saathi_app can SET ROLE
    -- service_role and gain the bypass, but the bare login role never does.
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Default privileges: make every table created later in `public` by the
-- migration owner reachable by the three roles. Mirrors Supabase's defaults.
--
-- This is safe because every user-facing table created by 0001..0023 has
-- `enable row level security`. The DML grants below are the *capability*;
-- the RLS policies are the *constraint*. RLS without the grants → permission
-- denied. Grants without RLS → open table. Both must be present.
-- ---------------------------------------------------------------------------
alter default privileges for role raahuldutta in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role raahuldutta in schema public
  grant all on tables to service_role;
-- The current schema uses uuid PKs with gen_random_uuid() defaults — no
-- owned sequences exist. The line below is for future-proofing only.
alter default privileges for role raahuldutta in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transient `auth` schema shim
-- ---------------------------------------------------------------------------
-- Only needed so 0001..0004 apply. 0005 drops both triggers + every FK into
-- auth.users; 0024 drops the schema. After 0024 the shim is gone — clean
-- vanilla-Postgres end state.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- 0001 has `references auth.users(id)` on several tables. The trigger
-- function `handle_new_user` in 0003 reads new.raw_user_meta_data, new.email,
-- new.email_confirmed_at; we don't model those columns because the trigger
-- body never runs during migrations (nobody inserts into auth.users — Clerk
-- owns users now). The id column is enough for the FK + trigger creation.
create table if not exists auth.users (
  id uuid primary key
);

-- 0003 also creates an `on_identity_linked` trigger on auth.identities.
-- Without this table, CREATE TRIGGER errors hard and aborts 0003.
-- Columns mirror what the trigger function reads (user_id, provider,
-- identity_data); again, body never runs during migrations.
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  provider text,
  identity_data jsonb
);

-- Must return uuid (0002 compares `auth.uid() = id` where id is uuid).
-- During the brief window where the auth.uid() shim is live (0001..0004),
-- request.jwt.claims is never set, so the function returns NULL — which
-- means 0002's RLS policies effectively grant nothing to anon/authenticated.
-- That's fine: no real queries run between 0001 and 0005 during migration.
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
