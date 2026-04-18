# UX — matchmaking

**Status:** design anchor (not yet built)
**Date:** 2026-04-18
**Context:** freezes the shape of the match-discovery surface so whoever
picks up the implementation has something to point at.

---

## The decision

**Curated shortlist, not a swipe feed.** Both sides see a small,
ranked set of candidates chosen for a specific flight. Rich profile
content per card. One clear CTA. No infinite scroll, no gestures that
make a high-stakes decision feel casual.

The same card DNA renders on both sides — only the subject changes.

## Why not Tinder

Three properties of Saathi break the Tinder model:

1. **Asymmetric stakes.** A family is entrusting a stranger with their
   elderly parent. A companion is volunteering a few hours of airport
   time. Treating these as symmetric swipes misreads the emotional
   weight on the family side.
2. **Sparse supply.** Tinder works because supply is abundant — swipe
   fatigue is the point. On a given flight on a given day, Saathi
   might have 0-3 candidates. A deck of 2 cards isn't a deck.
3. **Time-bound subjects.** A trip expires the moment the flight lands.
   Profiles aren't evergreen; they're tied to one QR540 on one date.
   Matching needs to be "best options for _this flight_," not "people
   you might like."

Swiping also gamifies a decision that benefits from friction. The user
should _think_ before sending a match request, not flick one off.

## Principles that fall out of this

- **Evidence > vibes.** Every card leads with _why this person_ — the
  specific overlap (same plane, same route, shared language), not a
  photo-first aesthetic.
- **Shortlist > feed.** 3-5 cards above the fold, collapse the rest.
  Pressure to decide carefully beats pressure to keep swiping.
- **One CTA, one intent.** Each card funnels to a single action with
  friction (intro message + needs) — not instant chat, not silent match.
- **Mirror, don't clone.** Both sides use the same card shape. The
  subject flips (companion ↔ family), the CTA verb flips, the trust
  rationale stays the same.

---

## Family side — "companions on your flight"

Entry point from the trip dashboard: _"3 companions are on your
flight — see who they are →"_. Route to `/trip/:id/matches`.

### Page layout

```
┌─────────────────────────────────────────────────────┐
│  Your trip · CCU → DOH → AMS · Apr 20              │
│  QR540 + QR23 · Mom (70-80) · Bengali, Hindi       │
│                                                     │
│  We found 3 companions on your flight.             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  [photo]  Priya S.                        ★ 4.9/12 │
│                                                     │
│  ● Also on QR540 + QR23  (same plane, same day)    │
│  Languages: Bengali · Hindi · English              │
│  "TU Delft grad student. Flew home with my         │
│   grandma last month — happy to help."             │
│  ✓ LinkedIn   ✓ Email   ✓ WhatsApp                 │
│                                                     │
│                         [ Send a message → ]       │
└─────────────────────────────────────────────────────┘
┌── Aditya M. ─ Also on QR23 · Bengali · ✓✓ ─────────┐
┌── Sara K. ─ Similar route Apr 21 · Hindi · ✓ ──────┐

                    — 2 more available —              (collapse)
```

### Empty state

```
No companions on your flight yet.
We'll email you the moment someone posts.

In the meantime, you can:
  · Share your trip with your network  [copy link]
  · Loosen the window to ±3 days       [see nearby]
```

### Zero-shortlist state (rank below threshold)

If nobody scores past the "on your actual flight" bar, show a clear
downgrade rather than pretending:

```
No one is on QR540 + QR23 yet.
Here are 2 people on your route a day either side —
they're not on the same plane, but they might be able to help.
```

### CTA behavior

Tap **Send a message** on a card → intro modal:

```
┌─ Message Priya ─────────────────────────────────────┐
│  Hi Priya,                                          │
│                                                     │
│  My mom Rina (72) is flying CCU → DOH → AMS on     │
│  Apr 20 on QR540 + QR23 — same flight as you.      │
│  She speaks Bengali and Hindi.                      │
│                                                     │
│  [                                               ]  │  ← editable
│                                                     │
│  She'll need help with:                             │
│    ☑ Wheelchair at transfers                        │
│    ☐ Translation with airline staff                 │
│    ☑ Finding her gate at DOH                        │
│    ☐ A meal                                         │
│                                                     │
│         [ Cancel ]         [ Send request → ]      │
└─────────────────────────────────────────────────────┘
```

- Intro is pre-filled with the concrete facts (flight, relative's
  name, language) — editable but useful even if the user doesn't edit.
- Needs checkboxes drive the `help_categories` field — gives the
  companion something specific to agree to, not an open-ended "help."
- One match_request per (companion, trip) — the DB already enforces
  this; the UI shows "Pending · sent 10 min ago" on the card after send.

### Ranking — what drives "we found 3 companions"

Order the shortlist by the existing scorer ([lib/matching.ts](../lib/matching.ts)),
cut at 5. The badge on each card translates the score into plain
English — the user should never see the score itself:

| Score band          | Badge text                       |
| ------------------- | -------------------------------- |
| flight_number match | "Also on QR540 + QR23"           |
| same route, ±1 day  | "Same route, 1 day apart"        |
| same route, same dy | "Also going CCU → AMS on Apr 20" |
| one-leg overlap     | "Can help with the AMS leg"      |

Cards below the "flight_number match" band collapse by default with
the `— N more available —` expander.

---

## Companion side — "flights that need help"

Entry point from the dashboard: _"4 families near you need a
companion →"_. Route to `/browse` (the directory already exists).

Same card shape, mirrored content. The subject is **the flight**, not
the family; the elder PII stays behind the match-gate.

### Page layout

```
┌─────────────────────────────────────────────────────┐
│  Flights that need help                             │
│                                                     │
│  Filters: [ from: CCU ▾ ] [ to: AMS ▾ ] [ date ▾ ] │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  QR540 + QR23 · CCU → DOH → AMS · Apr 20           │
│                                                     │
│  ● This is your flight                              │
│  Rina's daughter · speaks Bengali, Hindi            │
│  Helping with: wheelchair, gate navigation          │
│  One traveller, age 70-80                           │
│  "My mom has done the trip before but gets anxious │
│   at transfers. Grateful for company at DOH."     │
│                                                     │
│                         [ Offer to help → ]        │
└─────────────────────────────────────────────────────┘
┌── Amsterdam · Apr 21 · Same route, 1 day later ────┐
┌── Mumbai hop · Apr 19 · Different plane, similar ──┐
```

### Card content deltas from family side

| Field              | Family card shows…       | Companion card shows…       |
| ------------------ | ------------------------ | --------------------------- |
| Primary subject    | Companion name + photo   | Flight number + route       |
| Identity reveal    | Companion first name     | Family first name only      |
| Elder info         | (n/a — their own parent) | "One traveller, age 70-80"  |
| No photos of elder |                          | Not shown at all pre-match  |
| Language line      | Companion's languages    | Family's languages          |
| Needs              | (composed in modal)      | Pre-written help_categories |
| CTA                | "Send a message"         | "Offer to help"             |

The companion never sees the elder's name, photo, or medical notes
until the family accepts. `trip_elders` RLS enforces this at the DB
layer (once [bugs/01-trip-elders-rls.md](../bugs/01-trip-elders-rls.md)
lands).

### Empty state

```
No flights matching your filters.

[ Show flights on your route, any date →       ]
[ Show flights on any route, your date range → ]
```

### CTA behavior

Tap **Offer to help** → reverse of the family-side modal:

```
┌─ Offer to help Rina's family ───────────────────────┐
│  Hi,                                                │
│                                                     │
│  I'm Priya, also on QR540 + QR23 on Apr 20.        │
│  I speak Bengali, Hindi, and English. I'm happy    │
│  to help with wheelchair handoff and finding the   │
│  gate at DOH.                                       │
│                                                     │
│  [                                               ]  │  ← editable
│                                                     │
│  I can help with:                                   │
│    ☑ Wheelchair at transfers                        │
│    ☐ Translation with airline staff                 │
│    ☑ Finding her gate at DOH                        │
│    ☐ A meal                                         │
│                                                     │
│         [ Cancel ]         [ Send offer → ]        │
└─────────────────────────────────────────────────────┘
```

The checkboxes echo the family's requested `help_categories` —
companion opts into a subset. Creates a concrete agreement the family
can accept on, not "yeah I'll help with stuff."

---

## Shared primitives

Both sides render the same component with different content. Worth
building once.

### Card DNA

```
┌── <subject line> ──────────── <reputation> ──┐
│                                               │
│   ● <evidence badge — why this match>         │
│   <language line, matches bolded>             │
│   <one-sentence bio or ask, in their voice>   │
│   <verified-channel icons>                    │
│                                               │
│                       [ <one CTA> ]          │
└───────────────────────────────────────────────┘
```

- **Subject line.** Companion name (family side) or flight+route
  (companion side). First name only pre-match.
- **Reputation.** `★ avg / count` if `profile_review_stats` has data,
  omit otherwise — don't show "0 reviews," that reads as distrust.
- **Evidence badge.** The single strongest overlap signal, written in
  English. Colour-coded: green for flight-number match, blue for route
  match, grey for "similar."
- **Language line.** All languages, matching ones bolded so the viewer
  sees overlap at a glance.
- **Bio/ask.** Free-text from the poster, 200 chars visible, expand on
  tap. The part that lets them sound like a person, not a row.
- **Verified-channel icons.** Icons, not a count (avoids "5 verified"
  where 4 are Google). `bugs/LOW.md L01` notes the deduplication work
  to do on the data side.
- **CTA.** One button, opens the intro modal. Never "Match" or
  "Accept" — those words belong to the family-accepts-a-request step
  later in the funnel.

### Evidence badges — ranked

1. `● Also on <FLIGHT+FLIGHT>` — same flight number(s), same date. Green.
2. `● Also going <O> → <D> on <DATE>` — same route, same date. Blue.
3. `● Same route, N day(s) apart` — same route, within window. Blue.
4. `● Can help with the <D> leg` — partial overlap. Grey.
5. `● Nearby route` — fallback. Grey, collapsed by default.

(Once [bugs/ALGORITHM.md](../bugs/ALGORITHM.md) lands, the badge is
computed from `trip_legs` not `route[]`. Bands 1 and 4 become trivially
derivable.)

### Intro modal

Same component, same shape, different pre-fill strategy:

- Family → pre-fills elder's first name + needs. Companion checkboxes
  are the family's **requested** help categories.
- Companion → pre-fills companion's own name + languages. Checkboxes
  are the companion's **offered** subset of the family's requested set.

### What does NOT go on a card

- Full name. First-name-only until the match is accepted.
- Elder photo. Never pre-match, never anon-visible.
- Phone number / WhatsApp / email. Unlocked post-match on `/match/:id`.
- Review text (only ★ avg + count). Full reviews on the profile page.
- Exact age. Age bands only.

---

## Open questions

Flag these explicitly so the builder doesn't pick silently:

- **How many cards?** 3, 5, or show-all-with-collapse? Probably 5 above
  the fold, rest collapsed. Test with real data.
- **Does the family see "Priya has already matched 2 other trips this
  month"?** Probably yes — it's a trust signal. Needs a count field
  on `public_profiles` derived from `matches`.
- **What happens when a companion's trip is itself a request?** Users
  can post both kinds. Today nothing stops it. If A's request matches
  B's offer, and A has also posted an offer that B could take, the UI
  should probably not show them both at once. Defer.
- **What's the right "loosen window" affordance?** Family has a tight
  window that found nothing — one tap to widen to ±3 days, or one tap
  to see "different plane, same route"? Probably both, labelled as
  downgrades not expansions.
- **What happens after "Send request" — stay on page, or navigate?**
  Recommend: stay, toast the success, flip the card to a pending
  state. Let the family keep scanning other candidates.

---

## Not in this doc

- The match page itself (`/match/:id`). Out of scope — already partially
  built and has its own bugs (see [bugs/01-trip-elders-rls.md](../bugs/01-trip-elders-rls.md)).
- Post-wizard UX (how users create a trip). Out of scope.
- Notifications. See [bugs/MEDIUM.md](../bugs/MEDIUM.md) M03, M04.
- Admin / moderation. Out of scope.
