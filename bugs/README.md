# Saathi — known bugs & open issues

First audit pass: **2026-04-18** (pre-launch snapshot).

This folder is the open-source issue tracker for code-quality / correctness /
security findings. Each HIGH-severity bug gets its own file so a contributor
can pick it up and ship a fix without untangling it from the others. MEDIUM
and LOW are rolled up. The graph-matching redesign — which is the structural
fix for bug #02 and the scalability path forward — lives in `ALGORITHM.md`.

## How to pick something up

1. Claim the bug by commenting on (or opening) a GitHub issue that links to
   the file.
2. Reproduce the failure mode described in the file before writing a fix.
   If you can't, say so in the issue — the repro might be wrong.
3. Keep the diff surgical (see `CLAUDE.md` §3). Touch only what the bug
   requires; orphaned cleanup goes into a separate PR.

## Severity

- **HIGH** — security, data loss, or the feature just doesn't work. Fix before launch.
- **MEDIUM** — correctness or reliability hole. Will hurt under real load.
- **LOW** — polish, defense-in-depth, footguns.

## Index

### HIGH

| #   | Title                                                                                    | File                                                                 |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 01  | `trip_elders` RLS blocks matched companion from seeing elder PII                         | [01-trip-elders-rls.md](01-trip-elders-rls.md)                       |
| 02  | Partial-leg helpers never match (the DOH→AMS student case)                               | [02-partial-leg-helpers.md](02-partial-leg-helpers.md)               |
| 03  | `routeMatch()` is direction-blind — return-leg travelers score as "endpoints"            | [03-route-direction.md](03-route-direction.md)                       |
| 04  | Flight-number matching ignores travel date — same number, different day, different plane | [04-flight-number-ignores-date.md](04-flight-number-ignores-date.md) |
| 05  | `/api/cron/auto-complete` auth fails open when `CRON_SECRET` unset                       | [05-cron-auth-fails-open.md](05-cron-auth-fails-open.md)             |

### MEDIUM & LOW

- [MEDIUM.md](MEDIUM.md) — 8 items (rate limiting, validation, notify race, moderation queue, accept race, blocks policy, public notes, rollback)
- [LOW.md](LOW.md) — 5 items (allowlists, orphan profiles, polish)

### The graph redesign

- [ALGORITHM.md](ALGORITHM.md) — `trip_legs` table + leg-based matching query + where Bloom actually fits (and doesn't). The structural fix for #02 and the scale path.

## Reading order if you're new

1. This file.
2. [ALGORITHM.md](ALGORITHM.md) — explains the core data-model mistake that drives several of the bugs.
3. [01-trip-elders-rls.md](01-trip-elders-rls.md) — the cheapest HIGH to fix; good first PR.
