# Low-severity issues

Polish, defense-in-depth, and footguns. None of these are launch
blockers — batch them into a single cleanup PR when someone feels
like it.

---

## L01 — `languages` on trips has no allowlist

**Status:** ✅ FIXED in [app/post/actions.ts](../app/post/actions.ts) + [app/onboarding/actions.ts](../app/onboarding/actions.ts) (2026-04-18). Both trip-post and onboarding now refine language entries against the canonical `LANGUAGES` list from [lib/languages.ts](../lib/languages.ts). Free-text variants like "English (US)" are rejected at submit; stored values are all from the curated ~35-language list. Content below preserved for history.

**File:** [app/post/actions.ts:47](../app/post/actions.ts)

`z.array(z.string().min(1)).min(1)` accepts `"English (US)"`,
`"english"`, `"Eng"`, `"Klingon"`. `languageBand()` does case-insensitive
equality only — so "English (US)" vs "English" silently don't match.

**Fix:** use an enum. [lib/languages.ts](../lib/languages.ts) already
exists; wire it in.

---

## L02 — Clerk webhook hard-codes `role: 'companion'`

**Status:** ✅ FIXED in [db/migrations/0023_onboarding_complete.sql](../db/migrations/0023_onboarding_complete.sql) + [app/onboarding/actions.ts](../app/onboarding/actions.ts) (2026-04-18). Added `profiles.onboarding_complete boolean not null default false` (indexed). The placeholder role='companion' from the webhook stays for users who bounce, but analytics and admin views can now filter on `onboarding_complete = true` to get the real funnel. Flips to true at the end of `saveOnboardingProfile` once display_name, role, phone, and languages are all populated. Content below preserved for history.

**File:** [app/api/clerk-webhook/route.ts:113-122](../app/api/clerk-webhook/route.ts)

Default on insert, overwritten in onboarding. A user who bounces off
onboarding will show as a "companion" in any admin view / analytics.

**Fix:** either make `profiles.role` nullable until onboarding, or add
an `onboarding_complete` bool so unfinished accounts are visible.

---

## L03 — `public_profiles` filters `is_active = true` but nothing flips it

**File:** [db/migrations/0011_drop_profile_language_arrays.sql:66](../db/migrations/0011_drop_profile_language_arrays.sql)

Every row starts `is_active = true` and nothing in the codebase toggles
it. Soft-delete is unimplemented. Either wire it (admin UI + RLS policy
for owners to deactivate) or remove the filter.

---

## L04 — `user.deleted` Clerk event isn't handled

**Status:** ✅ FIXED in [app/api/clerk-webhook/route.ts](../app/api/clerk-webhook/route.ts) (2026-04-18). Added a `user.deleted` branch that drops the `profiles` row. Every FK into `profiles` is declared `ON DELETE CASCADE`, so all downstream rows follow automatically. Content below preserved for history.

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
