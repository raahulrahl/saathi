# Low-severity issues

Polish, defense-in-depth, and footguns. None of these are launch
blockers — batch them into a single cleanup PR when someone feels
like it.

---

## L01 — `languages` on trips has no allowlist

**File:** [app/post/actions.ts:47](../app/post/actions.ts)

`z.array(z.string().min(1)).min(1)` accepts `"English (US)"`,
`"english"`, `"Eng"`, `"Klingon"`. `languageBand()` does case-insensitive
equality only — so "English (US)" vs "English" silently don't match.

**Fix:** use an enum. [lib/languages.ts](../lib/languages.ts) already
exists; wire it in.

---

## L02 — Clerk webhook hard-codes `role: 'companion'`

**File:** [app/api/clerk-webhook/route.ts:113-122](../app/api/clerk-webhook/route.ts)

Default on insert, overwritten in onboarding. A user who bounces off
onboarding will show as a "companion" in any admin view / analytics.

**Fix:** either make `profiles.role` nullable until onboarding, or add
an `onboarding_complete` bool so unfinished accounts are visible.

---

## L03 — `public_profiles` filters `is_active = true` but nothing flips it

**File:** [supabase/migrations/0011_drop_profile_language_arrays.sql:66](../supabase/migrations/0011_drop_profile_language_arrays.sql)

Every row starts `is_active = true` and nothing in the codebase toggles
it. Soft-delete is unimplemented. Either wire it (admin UI + RLS policy
for owners to deactivate) or remove the filter.

---

## L04 — `user.deleted` Clerk event isn't handled

**File:** [app/api/clerk-webhook/route.ts:94-144](../app/api/clerk-webhook/route.ts)

When a user deletes their Clerk account, the `profiles` row remains with
its FK cascade chain dangling. Over time, orphaned profiles accumulate.

**Fix:** add a `user.deleted` branch that `DELETE`s the profile (cascades
will clean trips/matches/etc.).

---

## L05 — `lib/matching.ts::matchingFlightNumbers` returns the non-canonical casing

**File:** [lib/matching.ts:129-136](../lib/matching.ts)

`matchingFlightNumbers(['qr 540'], ['QR540'])` returns `['qr 540']` —
the trip's original casing. If any UI displays matched flight numbers,
the casing will be whatever the poster typed. Minor cosmetic.

**Fix:** return the canonical form from `normaliseFlight()`, or fix at
the display layer.

---

## Footgun notes (not bugs)

- `public.clerk_user_id()` returns NULL for anon. Policies that use
  `NOT (clerk_user_id() = x)` will be always-NULL → always-false for
  anon, which may be the opposite of what's intended. If you add such a
  policy, wrap with `coalesce(..., '')`.
- `dateWindow()` uses UTC-midnight consistently. Document that
  `trips.travel_date` is interpreted as UTC, not local. A flight leaving
  CCU at 02:00 local on Apr 20 is `travel_date = 2026-04-19` or
  `2026-04-20` depending on how the poster entered it — decide once.
- `public_trips` exposes `status` to anon. Scrapers can measure match
  throughput. Low-signal concern pre-launch.
