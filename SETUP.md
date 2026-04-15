# Setup

How to take Saathi from a clone of this repo to a working deployment with
real Clerk + Supabase behind it. Everything in the code already assumes this
wiring — this doc is just the click-path to actually connect it.

If you already have the project running locally and just want to deploy, skip
to [§ 8: Deploy](#8-deploy).

---

## 0. Prerequisites

```bash
node --version    # 20.18.0 per .nvmrc
pnpm --version    # 9.x (via corepack)
supabase --version
```

- Node 20.18 or later (`.nvmrc` pins the minor).
- `pnpm` via `corepack enable` (the `packageManager` field in `package.json` is
  authoritative — don't install a global pnpm).
- Supabase CLI — used for `db:push`, `db:reset`, `db:types`.

```bash
pnpm install
```

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard). Region
   close to your primary users (e.g. Frankfurt for EU).
2. From **Project Settings → API**, copy three values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Project Settings → API → JWT Settings**, copy the **JWT Secret**.
   Keep it open in a tab — you'll paste it into Clerk in §3.

### Push migrations

```bash
supabase login                  # one-time
supabase link --project-ref <your-project-ref>
pnpm db:push                    # applies everything in supabase/migrations/
```

After push, verify in **Database → Tables**:

- `profiles` (text PK, not uuid)
- `trips`, `verifications`, `match_requests`, `matches`, `messages`,
  `reviews`, `trip_photos`, `reports`, `blocks`
- Views: `public_profiles`, `public_verifications`, `public_trips`,
  `profile_review_stats`

And in **Database → Functions**: `public.clerk_user_id()`.

> **Safe-by-nuke**: Migration `0005_clerk.sql` cascade-drops the pre-Clerk
> schema. Don't run it against a production DB with data in it. For a fresh
> project, it's fine — that's exactly what it's for.

---

## 2. Clerk application

1. Create an application at [clerk.com](https://dashboard.clerk.com).
2. From **API Keys**, copy into `.env.local`:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. In **Paths**, set the URLs (or leave as defaults that match
   `.env.example`):
   - Sign-in: `/auth/sign-in`
   - Sign-up: `/auth/sign-up`
   - After sign-in / sign-up: `/onboarding`

### Enable OAuth providers

**User & Authentication → Social Connections**, enable these four:

- **Google**
- **Facebook**
- **LinkedIn (OIDC)** — pick the OIDC variant; the webhook mapping is keyed on `oauth_linkedin_oidc`
- **X (Twitter)**

Also leave **Email** on — it's the fallback sign-in method. Email alone
doesn't count as a "verified social account" (every Clerk sign-up verifies
email; counting it would mean a free badge).

For each provider, either use Clerk's shared credentials (fine for dev) or
create an OAuth app on the provider's side and paste client ID + secret.
The Clerk webhook in `app/api/clerk-webhook/route.ts` and the self-heal in
`lib/clerk-sync.ts` both map provider slugs by substring:

- anything containing `linkedin` → `linkedin`
- `oauth_x` / `oauth_twitter` / anything containing `twitter` → `twitter`
- anything containing `google` → `google`
- anything containing `facebook` → `facebook`

Identities Clerk reports with other providers (GitHub, Discord, etc.)
are ignored on the way into our `verifications` table. The table itself
is used for trust badges on profile cards — it's no longer a gate for
posting or sending requests (see the onboarding simplification).

---

## 3. The JWT template — the crucial bit

This is what glues Clerk's auth to Supabase's RLS. Skip it and every
authenticated DB call silently falls back to anon and fails.

1. Clerk dashboard → **JWT Templates** → **New template**.
2. Name it **exactly** `supabase` (lowercase, no variations). `lib/supabase/server.ts:21`
   calls `getToken({ template: 'supabase' })` — the string must match.
3. **Signing algorithm**: `HS256`.
4. **Signing key**: paste the Supabase **JWT Secret** from §1.3.
5. **Claims** — you can use the default, or explicitly set:

   ```json
   {
     "aud": "authenticated",
     "role": "authenticated",
     "sub": "{{user.id}}"
   }
   ```

6. Save.

The Supabase side doesn't need any config — it verifies any JWT signed with
its own secret. Our `public.clerk_user_id()` function
(`supabase/migrations/0005_clerk.sql:60-70`) reads the `sub` claim as text.

---

## 4. Clerk webhook

The webhook creates `profiles` rows on `user.created` and syncs verified
OAuth accounts into `verifications` on `user.updated`. Without it, signing
up works but no profile ever exists — onboarding will 500.

1. Clerk dashboard → **Webhooks** → **Add Endpoint**.
2. **Endpoint URL**: `https://<your-domain>/api/clerk-webhook`. For local
   development, use [ngrok](https://ngrok.com) or Clerk's webhook forwarding
   to tunnel to `http://localhost:3000/api/clerk-webhook`.
3. **Subscribe to events**:
   - `user.created`
   - `user.updated`
4. Copy the **Signing Secret** → `.env.local` as `CLERK_WEBHOOK_SECRET`.

Test: create a test user in Clerk → they should appear in Supabase
`profiles` within a few seconds. If not, check Clerk's Webhook Logs for the
actual failure (most commonly: missing service role key, or the webhook
endpoint is not reachable).

---

## 5. `.env.local`

Copy the template and fill in what you've got so far:

```bash
cp .env.example .env.local
```

The only values that must be non-empty for the app to boot and for auth to
work end-to-end:

```dotenv
# Must be set for anything to work
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Everything else below is **optional for dev** — the code gracefully no-ops
when these are missing:

| Var                                                       | Feature                            | Status if unset                                |
| --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/VERIFY_SERVICE_SID`        | WhatsApp OTP verification          | `/api/verify/*` returns 502 with a clear error |
| `UPSTASH_REDIS_REST_URL/TOKEN`                            | Rate limiting on verify endpoints  | Rate limiter no-ops                            |
| `SENTRY_DSN`                                              | Error tracking                     | Sentry no-ops                                  |
| `NEXT_PUBLIC_POSTHOG_KEY`                                 | Analytics                          | Not yet wired                                  |
| `RESEND_API_KEY`                                          | Transactional email                | Not yet wired                                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Captcha                            | Not yet wired                                  |
| `OPENAI_API_KEY`                                          | Future LLM moderation              | Not yet wired                                  |
| `CRON_SECRET`                                             | Protects `/api/cron/auto-complete` | Cron endpoint rejects every call               |

---

## 6. Run locally

```bash
pnpm dev
```

Visit <http://localhost:3000>. You should be able to:

- Browse the landing page (unauthenticated).
- Peek on route + date in the "Haven't booked the ticket yet?" section.
- Sign in via Clerk. On first sign-in, Clerk fires the `user.created`
  webhook, which inserts your row into `profiles`, and you land on
  `/onboarding`.
- After onboarding, `/dashboard` should show your empty state.

If Supabase calls 401 or RLS-fail silently — the JWT template in §3 is the
first thing to check. The `Authorization: Bearer …` header is only attached
when `getToken({ template: 'supabase' })` returns a token, and that fails
loudly if the template doesn't exist but silently (returning `null`) if the
template has the wrong name.

---

## 7. Optional services

These exist in the env template but aren't wired into code yet. Add as
needed.

### Twilio Verify (WhatsApp OTP)

Used by `/api/verify/whatsapp/*` via `lib/verify.ts`. Create a Verify
service in Twilio, enable the **WhatsApp** channel on it, paste creds.
Without these, `/api/verify/whatsapp/start` returns an error — the UI
should show a stub banner.

### Upstash Redis (rate limiting)

Protects the verify endpoints from abuse. Create a Redis database at
[upstash.com](https://upstash.com), paste `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`. The rate limiter (see `lib/rate-limit.ts`)
no-ops when these are unset, so local dev doesn't need them.

### Sentry

Create a Next.js project at [sentry.io](https://sentry.io), paste the DSN
into `SENTRY_DSN`. The Sentry SDK initialises from `instrumentation.ts`
and `sentry.client.config.ts` — both no-op cleanly if the DSN is missing.

---

## 8. Deploy

### Vercel (recommended)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Framework: **Next.js** (auto-detected).
3. **Environment Variables**: paste every value from `.env.local`. For
   `NEXT_PUBLIC_SITE_URL` use the Vercel production URL (e.g.
   `https://saathi.travel`).
4. Deploy.

### After first deploy

- Update the Clerk webhook endpoint URL to the production domain.
- Update the Clerk **allowed origins** to include the production domain.
- Update Supabase **auth allowed redirect URLs** if you ever add Supabase-side
  OAuth callbacks (currently we route everything through Clerk, so this is
  empty by default).

---

## 9. Troubleshooting

### "signed in but nothing saves"

JWT template misconfigured or named something other than `supabase`. See §3.
Open the Network tab while signed in — Supabase requests should have an
`Authorization: Bearer …` header. If they don't, the template fetch is
returning null.

### "signed up but onboarding 500s"

Webhook never fired, so no `profiles` row exists. Check Clerk → Webhooks →
Logs. If the endpoint returned 401, your `CLERK_WEBHOOK_SECRET` doesn't
match Clerk's signing secret. If it returned 500 with `profiles upsert:
…`, your `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong.

### "public_trips queries return empty"

Migration not pushed. Run `pnpm db:push`. Check the Tables view in Supabase.

### "RLS denied on every authenticated call"

The Clerk user id format is `user_2abc…` but the `profiles.id` column might
be a UUID if you ran the old pre-0005 schema. Ensure `0005_clerk.sql` ran
successfully — it rekeys everything to text. In a fresh project this is
automatic via `db:push`.
