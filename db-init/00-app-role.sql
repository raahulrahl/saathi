-- db-init/00-app-role.sql
-- The app login role. Runs once per local DB after 0000_bootstrap.sql.
-- Idempotent.
--
-- saathi_app is what the Next.js app connects as (DATABASE_URL). It has:
--   * LOGIN: yes (you connect as this)
--   * NOSUPERUSER, NOCREATEDB, NOCREATEROLE: least privilege
--   * NOBYPASSRLS: cannot bypass RLS itself
--   * NOINHERIT: holding membership in anon/authenticated/service_role
--                does NOT ambiently grant their privileges. The app must
--                explicitly SET LOCAL ROLE inside withUser/withService.
--                Forgetting → permission denied (fail closed).
--
-- The password is for local dev only and is not a secret.

do $$
begin
  if not exists (select from pg_roles where rolname = 'saathi_app') then
    create role saathi_app
      login password 'dev'
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end
$$;

-- Membership lets saathi_app `SET ROLE` into each target. No ambient
-- privileges (NOINHERIT) — must switch explicitly.
grant anon, authenticated, service_role to saathi_app;

-- saathi_app needs schema usage to even reach objects after SET ROLE.
grant usage on schema public to saathi_app;
