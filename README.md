<p align="center">
  <img src="public/git-hero.png" alt="Saathi — a companion on the flight home" width="100%">
</p>

<div align="center">

<img src="public/logo.jpeg" alt="Saathi" width="96" />

# Saathi

**साथी** — _companion · partner · friend on the journey_

**Nobody flies alone.**

The open-source matchmaking platform for cross-border family travel.<br/>
Pair a parent, a pregnant traveller, or a first-time flyer with someone already on the same plane who can walk them through transfers, translate at the gate, and make sure they get home.

[![CI](https://github.com/raahulrahl/saathi/actions/workflows/ci.yml/badge.svg)](https://github.com/raahulrahl/saathi/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/raahulrahl/saathi?style=flat)](https://github.com/raahulrahl/saathi/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/raahulrahl/saathi?style=flat)](https://github.com/raahulrahl/saathi/network/members)
[![GitHub issues](https://img.shields.io/github/issues/raahulrahl/saathi)](https://github.com/raahulrahl/saathi/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/raahulrahl/saathi)](https://github.com/raahulrahl/saathi/pulls)
[![Hits](https://hits.sh/github.com/raahulrahl/saathi.svg)](https://hits.sh/github.com/raahulrahl/saathi/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Website](https://getsaathi.com) · [Report a bug](https://github.com/raahulrahl/saathi/issues/new) · [Request a feature](https://github.com/raahulrahl/saathi/issues/new) · [Contributing](#contributing)

**English** | हिन्दी _(soon)_ | বাংলা _(soon)_

</div>

## What is Saathi?

Every diaspora family knows the call: a parent flying alone, a long layover, an unfamiliar terminal, a language they only half-speak. We wait for them to message that they've found the gate. We don't sleep until they do.

There are tens of thousands of solo travellers on the same flight, doing nothing in particular for those eight hours. **Saathi puts those two people in touch a few weeks before the flight**, sets up an introduction, and lets the family stop holding their breath at 3 AM.

We don't run the trip. We don't take a cut. We make the introduction, then get out of the way.

<p align="center">
  <img src="public/home.png" alt="Saathi home page — search for a companion on your flight" width="900">
</p>

## Features

- **Leg-based matching** — a student flying only the Doha→Amsterdam leg of a larger itinerary can help your parent on that transfer, even if they're not on the full route. Matches compute on directed flight legs, not whole itineraries.
- **Language-first ranking** — primary-language match beats route match beats date proximity. A Bengali-speaking parent isn't served by an English-only companion.
- **Verified identity, lightweight** — WhatsApp OTP (Twilio) + social profile URLs. Enough accountability to trust a stranger with your mother; not so much friction that nobody signs up.
- **Curated shortlist, not swipe feed** — families see the top 3-5 companions for their specific flight, each card answering _"why this person?"_ in one line (`● Also on QR540 + QR23`).
- **Private by default** — contact details unlock only after an accepted match. Notes moderated at submit; phone and email patterns are blocked to prevent bypassing the match gate.
- **Durable notification queue** — Postgres-backed, atomic claim via `FOR UPDATE SKIP LOCKED`, per-recipient daily digest so a popular route doesn't flood anyone's inbox.

---

## Quick Start

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

Optional env vars (Sentry, Twilio, PostHog, Resend, AirLabs, OpenAI) are read lazily — features that depend on a missing key disable themselves rather than crash. See [`.env.example`](.env.example) for the full list and what each one unlocks.

---

## How it works

### 1. A family posts a request

Route (IATA codes), date, languages the parent speaks, what kind of help is welcome — wheelchair at transfers, translation at immigration, wayfinding between gates. Up to four travellers per trip if they're flying together.

### 2. A companion matches

Either they posted an offer for that route already, or the family sees them on the shortlist and sends an intro. All contact stays behind the match gate until the family accepts.

### 3. They agree on the handoff

After accept, both sides get WhatsApp and email. They coordinate the details — meeting at the gate, what the parent looks like, what help they'd like. Saathi stays out of it.

### 4. The flight happens

Someone walks the parent through immigration. Someone sits with them at boarding. Someone helps them find luggage at arrivals. The family stops holding their breath.

---

## Architecture

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│  Next.js 15  │────>│     Clerk      │     │    Supabase      │
│  App Router  │     │  (auth / JWT)  │────>│ Postgres + RLS   │
└──────┬───────┘     └────────────────┘     └──────┬───────────┘
       │                                           │
       ├──────────────────────┬──────────────┬─────┤
       │                      │              │     │
┌──────▼──────┐  ┌────────────▼───┐  ┌───────▼──┐  │
│ /matches    │  │ notification   │  │ trip_legs│  │
│ shortlist   │  │ queue (cron)   │  │  graph   │  │
└─────────────┘  └───────┬────────┘  └──────────┘  │
                         │                         │
               ┌─────────┴─────────┐               │
           ┌───▼────┐         ┌────▼─────┐    ┌────▼─────┐
           │ Resend │         │ Twilio   │    │ AirLabs  │
           │ email  │         │ WhatsApp │    │ flights  │
           └────────┘         └──────────┘    └──────────┘
```

| Layer         | Stack                                                                |
| ------------- | -------------------------------------------------------------------- |
| Framework     | Next.js 15 (App Router, Server Actions, Server Components)           |
| Auth          | Clerk → Supabase RLS via Third-Party Auth JWT                        |
| Database      | Supabase Postgres + Row-Level Security                               |
| Matching      | Leg-based graph (`trip_legs`) with composite and partial indexes     |
| UI            | shadcn/ui + Tailwind CSS + Radix primitives                          |
| Validation    | Zod + react-hook-form                                                |
| Phone         | libphonenumber-js + Twilio Lookup + Twilio Messages (WhatsApp OTP)   |
| Notifications | Postgres queue with `FOR UPDATE SKIP LOCKED` dispatch + daily digest |
| Email         | Resend                                                               |
| Moderation    | OpenAI moderation + PII-pattern regex at submit                      |
| Rate limiting | Postgres-backed per-user token bucket                                |
| Errors        | Sentry                                                               |
| Analytics     | Vercel Analytics + Speed Insights                                    |
| Feature flags | PostHog via `@flags-sdk/posthog`                                     |
| Hosting       | Vercel                                                               |
| Tooling       | pnpm · Vitest · ESLint · Prettier · Husky · commitlint               |

---

## Scripts

| Script                              | What it does                                                |
| ----------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server                                          |
| `pnpm build`                        | Production build (uploads Sentry source maps if configured) |
| `pnpm lint`                         | ESLint                                                      |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                      |
| `pnpm typecheck`                    | `tsc --noEmit`                                              |
| `pnpm test`                         | Vitest run (`pnpm test:watch` for watch mode)               |
| `pnpm db:types`                     | Regenerate `types/db.ts` from linked Supabase project       |
| `pnpm db:reset`                     | Reset local Supabase + re-apply migrations                  |
| `pnpm db:push`                      | Push pending migrations to remote                           |

---

## Contributing

Saathi is open source and contributions are warmly welcome — code, design, copy edits, translations, bug reports, all of it.

**Before a non-trivial change**, open an issue (or comment on an existing one) so we can sanity-check direction together. Saves wasted work on either side.

Conventions:

- **Trunk-based.** PRs target `main`. No long-lived branches.
- **Conventional Commits.** Enforced by `commitlint` via a Husky `commit-msg` hook.
- **Tests where they matter.** Pure logic (matching, parsing) gets unit tests. UI changes are validated locally.
- **One thing per PR.** Small PRs land faster.

Run the floor before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

The live code-review + issue tracker lives in [`bugs/`](bugs), and the UX design anchor in [`docs/UX_MATCHMAKING.md`](docs/UX_MATCHMAKING.md).

---

## Roadmap

- **In-app chat** for matched pairs (currently fall back to WhatsApp/email).
- **Reviews UI** — table + RLS exist; the form ships with chat.
- **Trip photo uploads** + consent flow.
- **Admin / moderation panel** — reports table exists, UI doesn't.
- **Companion-side shortlist** — mirror of `/trip/[id]/matches` for companions browsing requests.
- **Connecting-flight chaining** — two companions covering consecutive legs. See [`bugs/ALGORITHM.md`](bugs/ALGORITHM.md).

---

## Star History

<a href="https://www.star-history.com/?repos=raahulrahl%2Fsaathi&type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=raahulrahl/saathi&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=raahulrahl/saathi&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=raahulrahl/saathi&type=Date" />
  </picture>
</a>

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for the full text. Use, modify, and ship Saathi freely; please keep the copyright and license notice on derivative work.

---

## A note on the name

**Saathi (साथी)** in Hindi, Bengali, Marathi, Punjabi, and several other Indian languages means _companion_, _partner_, _friend on the journey_. It's the word a parent might use for the person who walks them through a confusing terminal.

That's the whole product.
