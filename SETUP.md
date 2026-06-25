# Setup

How to take Saathi from a clone of this repo to a working deployment with real
Clerk + a Postgres database behind it. Everything in the code already assumes
this wiring — this doc is just the click-path to actually connect it.

If you already have the project running locally and just want to deploy, skip
to [§ 7: Deploy](#7-deploy).

---

## 0. Prerequisites

```bash
node --version    # 20.18.0 per .nvmrc
pnpm --version    # 9.x (via corepack)
psql --version    # any PostgreSQL 15+ client
```

- Node 20.18 or later (`.nvmrc` pins the minor).
- `pnpm` via `corepack enable` (the `packageManager` field in `package.json` is
  authoritative — don't install a global pnpm).
- A **PostgreSQL 15+** database — local (Postgres.app, Docker, `brew install
postgresql`) or hosted (Neon, RDS, Fly Postgres, …). The app is host-agnostic;
  it only needs a connection string.

```bash
pnpm install
```

---

## 1. Postgres database

The app talks to Postgres through **two** connection strings:

| Env var               | Connects as                                                                                                                         | Used by                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `saathi_app` — a `LOGIN` role with **no** table privileges of its own, only membership in `anon` / `authenticated` / `service_role` | the running app. `withUser` / `withService` in `lib/db` do `SET LOCAL ROLE` into the right role per transaction.                                           |
| `DIRECT_DATABASE_URL` | the schema **owner** (a superuser locally)                                                                                          | `pnpm db:migrate` and `pnpm db:pull`. Migrations create `SECURITY DEFINER` functions + owner-only tables, so they must run as the owner, not `saathi_app`. |

### Local setup

```bash
# 1. Create the database
createdb saathi

# 2. Apply migrations as the OWNER. The owner role must match the name in
#    db/migrations/0000_bootstrap.sql (`alter default privileges for role …`),
#    which currently hard-codes `raahuldutta`. Change that line to your local
#    superuser, or create a `raahuldutta` superuser.
DIRECT_DATABASE_URL=postgres://<owner>@localhost:5432/saathi pnpm db:migrate

# 3. 0000_bootstrap created the anon / authenticated / service_role roles.
#    Now create the app login role and grant it membership in all three.
psql saathi <<'SQL'
create role saathi_app login password 'dev';
grant anon, authenticated, service_role to saathi_app;
SQL
```

Then point both URLs at the database in `.env.local` (the `.env.example`
defaults already match the above):

```dotenv
DATABASE_URL=postgres://saathi_app:dev@localhost:5432/saathi
DIRECT_DATABASE_URL=postgres://<owner>@localhost:5432/saathi
```

> **Why two roles?** `saathi_app` is `NOINHERIT` with no table grants, so any
> code path that forgets the `withUser` / `withService` wrapper fails closed
> (`permission denied`) instead of silently bypassing RLS. The full rationale is
> in the header of `db/migrations/0000_bootstrap.sql`.

### Verify

```bash
pnpm db:smoke                 # exercises withUser/withService against live RLS
psql saathi -f db/seed.sql    # optional sample data — skip in production
```

`db:smoke` should print the seeded `alice + bob + trip` output. After
migrating, the schema has:

- Tables: `profiles`, `trips`, `match_requests`, `matches`, `messages`,
  `reviews`, `trip_photos`, `reports`, `blocks`, `trip_travellers`, `trip_legs`,
  `pending_notifications`, `rate_limits`
- Views: `public_profiles`, `public_trips`, `profile_review_stats`
- Function: `public.clerk_user_id()` (reads the `sub` claim — see §2)

> **Safe-by-nuke**: Migration `0005_clerk.sql` cascade-drops the pre-Clerk
> schema. It's what re-keys every table from `uuid` to Clerk's text user ids.
> Fine on a fresh database — that's exactly what it's for — but don't run a
> fresh chain against a production DB that already holds real data.

---

## 2. Clerk application

Clerk owns identity. The database is never handed a JWT to verify —
the app reads the signed-in Clerk user id server-side and binds it to the
transaction (`request.jwt.claims`), which `public.clerk_user_id()` reads inside
every RLS policy. Nothing to configure on that path; it just works once the
keys below are set.

1. Create an application at [clerk.com](https://dashboard.clerk.com).
2. From **API Keys**, copy into `.env.local`:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. In **Paths**, set the URLs (or leave as the `.env.example` defaults):
   - Sign-in: `/auth/sign-in`
   - Sign-up: `/auth/sign-up`
   - After sign-in / sign-up: `/post-auth` — this page routes new users to
     `/onboarding` and returning users to `/dashboard` (Clerk only supports one
     after-sign-in URL, so the branching lives in our route).

### Enable OAuth providers

**User & Authentication → Social Connections**, enable these four:

- **Google**
- **Facebook**
- **LinkedIn (OIDC)** — pick the OIDC variant; the webhook mapping is keyed on `oauth_linkedin_oidc`
- **X (Twitter)**

Also leave **Email** on — it's the fallback sign-in method.

For each provider, either use Clerk's shared credentials (fine for dev) or
create an OAuth app on the provider's side and paste client ID + secret. The
Clerk webhook in `app/api/clerk-webhook/route.ts` and the self-heal in
`lib/clerk-sync.ts` both map provider slugs by substring:

- anything containing `linkedin` → `linkedin`
- `oauth_x` / `oauth_twitter` / anything containing `twitter` → `twitter`
- anything containing `google` → `google`
- anything containing `facebook` → `facebook`

---

## 3. Clerk webhook

The webhook keeps the `profiles` table in sync with Clerk: it inserts a row on
`user.created`, refreshes it on `user.updated`, and deletes it on
`user.deleted` (every FK into `profiles` is `ON DELETE CASCADE`). Without it,
signing up works but no profile ever exists — onboarding will 500. (The
server-side self-heal in `lib/clerk-sync.ts` also creates a missing row on the
next authenticated page load, so a missed webhook recovers.)

1. Clerk dashboard → **Webhooks** → **Add Endpoint**.
2. **Endpoint URL**: `https://<your-domain>/api/clerk-webhook`. For local
   development, use [ngrok](https://ngrok.com) or Clerk's webhook forwarding to
   tunnel to `http://localhost:3000/api/clerk-webhook`.
3. **Subscribe to events**: `user.created`, `user.updated`, `user.deleted`.
4. Copy the **Signing Secret** → `.env.local` as `CLERK_WEBHOOK_SECRET`.

Test: create a test user in Clerk → a row should appear in the `profiles` table
within a few seconds. If not, check Clerk's Webhook Logs for the failure (most
commonly a `CLERK_WEBHOOK_SECRET` mismatch, or the endpoint isn't reachable).

---

## 4. `.env.local`

Copy the template and fill in what you've got so far:

```bash
cp .env.example .env.local
```

The only values that must be non-empty for the app to boot and for auth to work
end-to-end:

```dotenv
# Database
DATABASE_URL=postgres://saathi_app:dev@localhost:5432/saathi
DIRECT_DATABASE_URL=postgres://<owner>@localhost:5432/saathi

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Everything else is **optional for dev** — the code gracefully no-ops when these
are missing:

| Var                                                       | Feature                         | Status if unset                                |
| --------------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM/...`         | WhatsApp OTP verification       | `/api/verify/*` returns 502 with a clear error |
| `AIRLABS_API_KEY`                                         | Flight-route lookup (DB-cached) | `/api/flights/lookup` returns an error         |
| `RESEND_API_KEY`                                          | Transactional email digests     | Notification dispatch skips email              |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`                   | Error tracking                  | Sentry no-ops                                  |
| `NEXT_PUBLIC_POSTHOG_KEY`                                 | Feature flags                   | Flags fall back to defaults                    |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Captcha                         | Not enforced                                   |
| `OPENAI_API_KEY`                                          | LLM moderation                  | Moderation fails open                          |
| `CRON_SECRET`                                             | Protects `/api/cron/*`          | Cron endpoints reject every call               |

---

## 5. Run locally

```bash
pnpm dev
```

Visit <http://localhost:3000>. You should be able to:

- Browse the landing page (unauthenticated).
- Peek on route + date in the "Haven't booked the ticket yet?" section.
- Sign in via Clerk. On first sign-in the `user.created` webhook inserts your
  `profiles` row, and you land on `/onboarding`.
- After onboarding, `/dashboard` shows your empty state.

If authenticated queries return `permission denied` or silently come back
empty, the usual cause is a query running **outside** a `withUser` /
`withService` wrapper (so it executes as bare `saathi_app`, which has no table
grants), or `saathi_app` missing membership in the three roles — re-check
step 3 of §1.

---

## 6. Optional services

These have env slots but the app no-ops without them. Add as needed.

### Twilio (WhatsApp OTP)

Used by `/api/verify/whatsapp/*` via `lib/whatsapp-auth.ts`. Create a WhatsApp
sender (sandbox is fine for dev), paste the account SID/auth token and the
`TWILIO_WHATSAPP_*` values. Without these, the verify endpoints return a clear
error and the UI shows a stub banner.

### Sentry

Create a Next.js project at [sentry.io](https://sentry.io), paste the DSN into
`SENTRY_DSN` (and `NEXT_PUBLIC_SENTRY_DSN` for browser errors). The SDK
initialises from `instrumentation.ts` and the client config — both no-op
cleanly if the DSN is missing.

---

## 7. Deploy

### Vercel (recommended)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Framework: **Next.js** (auto-detected).
3. **Environment Variables**: paste every value from `.env.local`. Point
   `DATABASE_URL` / `DIRECT_DATABASE_URL` at your **hosted** Postgres (Neon, RDS,
   Fly, …) rather than localhost. For `NEXT_PUBLIC_SITE_URL` use the production
   URL (e.g. `https://getsaathi.com`). Set `CRON_SECRET` so the cron routes
   accept calls.
4. Deploy.

`vercel.json` already declares the two cron jobs — `/api/cron/send-notifications`
(every minute) and `/api/cron/auto-complete` (daily 03:00). Vercel picks them up
automatically.

> If `DATABASE_URL` points at a transaction pooler (PgBouncer / Supavisor / Neon
> pooler), no extra config is needed — `lib/db` already runs with
> `prepare: false` so pooled connections are safe.

### After first deploy

- Update the Clerk webhook endpoint URL to the production domain.
- Update Clerk's **allowed origins** to include the production domain.
- Run migrations against the production database once
  (`DIRECT_DATABASE_URL=<prod-owner-url> pnpm db:migrate`).

---

## 8. Troubleshooting

### "signed in but nothing saves"

A query is almost certainly running outside the `withUser` / `withService`
wrapper, so it executes as bare `saathi_app` and hits `permission denied`. Every
DB access must go through `lib/db`. Confirm `saathi_app` is a member of
`anon` / `authenticated` / `service_role` (§1, step 3).

### "signed up but onboarding 500s"

The webhook never fired, so no `profiles` row exists. Check Clerk → Webhooks →
Logs. A 401 means `CLERK_WEBHOOK_SECRET` doesn't match Clerk's signing secret.

### "public_trips queries return empty"

Migrations not applied. Run `pnpm db:migrate` and re-check with `pnpm db:smoke`.

### "RLS denied on every authenticated call"

`public.clerk_user_id()` reads `request.jwt.claims.sub`, which `withUser` sets
automatically. If `profiles.id` is a `uuid` you're on a pre-`0005` schema — run
the migration chain on a fresh database so `0005_clerk.sql` re-keys everything to
Clerk's text ids.
