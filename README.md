<div align="center">

# Saathi

**साथी** — _companion_

A matchmaking platform pairing elderly travellers with people already flying the same route, so no parent navigates an unfamiliar airport alone.

[**getsaathi.com**](https://getsaathi.com) · [Report a bug](https://github.com/getsaathi/saathi/issues/new) · [Request a feature](https://github.com/getsaathi/saathi/issues/new)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

## Why this exists

Every diaspora family knows the call: a parent flying alone, a long layover, an unfamiliar terminal, a language they only half-speak. We wait for them to message that they've found the gate. We don't sleep until they do.

There are tens of thousands of solo travellers on the same flight, doing nothing in particular for those eight hours. Saathi puts those two people in touch a few weeks before the flight, sets up an introduction, and lets the family stop holding their breath at 3 AM.

We don't run the trip. We don't take a cut. We make the introduction, then get out of the way.

## How it works

- **Families** post a request: route, date, languages the parent speaks, what kind of help they'd appreciate.
- **Companions** post offers when they're flying somewhere anyway, or browse open requests on routes they fly often.
- **Search ranks by language match first**, then date proximity, then route specificity. The parent who only speaks Bengali should not be matched with someone who can only manage English.
- **Verification is lightweight**: WhatsApp number (Twilio OTP) plus social profile URLs. We previously gated posting behind multiple OAuth links and dropped that — the friction outweighed the trust signal.
- **Saathi never touches money.** Any thank-you is settled directly between family and companion.

## Stack

| Layer         | What we use                                                        |
| ------------- | ------------------------------------------------------------------ |
| Framework     | Next.js 15 (App Router, Server Actions, Server Components)         |
| Auth          | Clerk (Third-Party Auth → Supabase RLS)                            |
| Database      | Supabase Postgres + RLS + Storage                                  |
| UI            | shadcn/ui + Tailwind CSS + Radix primitives                        |
| Validation    | Zod + react-hook-form                                              |
| Phone         | libphonenumber-js + Twilio Lookup + Twilio Messages (WhatsApp OTP) |
| Rate limiting | Upstash Redis + `@upstash/ratelimit`                               |
| Errors        | Sentry                                                             |
| Analytics     | Vercel Analytics + Speed Insights                                  |
| Feature flags | PostHog via `@flags-sdk/posthog`                                   |
| Hosting       | Vercel                                                             |
| Tooling       | pnpm · Vitest · ESLint · Prettier · Husky · commitlint             |

## Quick start

```bash
# 1. Use the pinned Node version (.nvmrc → 20.18.x)
nvm use

# 2. Install
corepack enable
pnpm install

# 3. Copy env and fill in at minimum: Clerk + Supabase keys
cp .env.example .env.local

# 4. Run
pnpm dev    # http://localhost:3000
```

A few env vars are optional in dev (Sentry, Twilio, PostHog) and the code is built to fail-soft when they're missing — features that depend on them disable themselves rather than crash. Look for `.env.example` for the full list and what each one unlocks.

## Repo layout

```
app/
  (marketing)/             landing, about, faq
  search/                  public browse + rank
  trip/[id]/               public trip detail + send-request flow
  profile/[id]/            public profile
  post/{request,offer}/    auth-gated posting wizard (one for each side)
  onboarding/              single-form profile setup + WhatsApp OTP
  dashboard/               my trips · incoming · sent · matches
  match/[id]/              match thread (chat + reviews coming)
  auth/                    Clerk-driven sign-in / sign-up
  api/
    verify/whatsapp/       Twilio Messages OTP start + check
    cron/auto-complete/    48h auto-complete job for finished trips
    clerk-webhook/         Svix-verified user.created sync
  icon.tsx                 Generated favicon (next/og)
  apple-icon.tsx           Generated Apple touch icon
  opengraph-image.tsx      Default 1200×630 OG card
  robots.ts · sitemap.ts   Crawler hints + canonical URL list

components/
  ui/                      shadcn primitives
  flight-composer/         the unified search/post entry component
  trip-card · route-line · language-chip · …

lib/
  matching.ts              ranking function + Vitest suite
  search.ts                server-side search helpers
  iata.ts                  IATA airport data (~500 airports)
  languages.ts             curated language + help-category lists
  supabase/                server / client / middleware factories
  whatsapp-auth.ts         Twilio Messages OTP, hashed in Supabase
  rate-limit.ts            Upstash sliding-window helper
  site.ts                  canonical origin helper

supabase/migrations/       SQL schema, RLS, triggers, views (numbered)
flags.ts                   PostHog flag adapter + identify
```

## Database

SQL migrations live under `supabase/migrations/` and are append-only. The schema is shaped around four nouns: **profiles**, **trips**, **match_requests**, and **matches**. Reads from anonymous traffic go through three views (`public_profiles`, `public_trips`, `profile_review_stats`) so RLS stays simple and PII stays redacted.

```bash
pnpm db:reset       # local: re-apply all migrations from scratch
pnpm db:push        # push pending migrations to a linked project
pnpm db:types       # regenerate types/db.ts (when a project is linked)
```

The most recent migrations document their reasoning at the top — start there if you want to understand a column choice rather than guessing.

## Scripts

| Script              | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `pnpm dev`          | Next.js dev server                                                  |
| `pnpm build`        | Production build (also runs Sentry source-map upload if configured) |
| `pnpm lint`         | ESLint (Next + Tailwind + unused-imports)                           |
| `pnpm format`       | Prettier write                                                      |
| `pnpm format:check` | Prettier check (CI)                                                 |
| `pnpm typecheck`    | `tsc --noEmit`                                                      |
| `pnpm test`         | Vitest run (`pnpm test:watch` for watch mode)                       |
| `pnpm db:types`     | Regenerate `types/db.ts` from a linked Supabase project             |
| `pnpm db:reset`     | Reset local Supabase + re-apply migrations                          |
| `pnpm db:push`      | Push pending migrations to remote                                   |

## Contributing

Saathi is open source and contributions are warmly welcome — code, design, copy edits, translations, bug reports, all of it.

**Before you start a non-trivial change**, please open an issue (or comment on an existing one) so we can sanity-check the direction together. Saves wasted work on either side.

A few conventions:

- **Trunk-based.** PRs target `main`. No long-lived feature branches.
- **Conventional Commits.** Enforced by `commitlint` via a Husky `commit-msg` hook. Examples: `feat(search): add airline filter`, `fix(otp): handle expired codes`.
- **Tests where they matter.** Pure logic (matching, parsing) gets unit tests. UI changes are validated by running them locally — type-check + lint + build is the floor before opening a PR.
- **One thing per PR.** A bug fix doesn't need surrounding cleanup. A feature doesn't need extra configurability. Small PRs land faster.

Run the floor before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Roadmap

The big-rock items not yet built (intentional — we wanted the public surface working first):

- In-app chat for matched pairs (currently fall back to direct WhatsApp/email)
- Reviews UI (table + RLS exist; the form ships with chat)
- Trip photo uploads + consent flow
- Admin / moderation panel (reports table exists, no UI yet)
- Public `/terms`, `/privacy`, `/report` pages

Open issues track the smaller stuff. If you want to claim something, comment "I'll take this."

## License

Apache License 2.0 — see [LICENSE](LICENSE) for the full text. You can use, modify, and ship Saathi freely; please keep the copyright + license notice on derivative work.

## A note on the name

**Saathi (साथी)** in Hindi, Bengali, Marathi, Punjabi, and several other Indian languages means _companion_, _partner_, _friend on the journey_. It's the word a parent might use for the person who walks them through a confusing terminal. That's the whole product.
