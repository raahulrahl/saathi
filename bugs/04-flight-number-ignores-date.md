# 04 — Flight-number matching ignores travel date

**Severity:** HIGH
**Area:** matching
**Found:** 2026-04-18

## Failure mode

The matcher's working theory is _"flight number identifies the physical
aircraft; therefore flight-number equality is the strongest match
signal."_ That's only true when **date** is pinned. Airline flight
numbers are reused daily (QR540 CCU→DOH flies every day of the year).
Two travellers with the same flight number on different dates are on
different airframes and cannot help each other.

Today the matcher drops the date filter entirely when a flight number is
provided:

- [lib/matching.ts:184-199](../lib/matching.ts) — `rankTrips` skips the
  `dayDiff` filter if `criteria.flightNumbers` is non-empty.
- [lib/search.ts:107-111](../lib/search.ts) — DB query skips
  `.gte('travel_date', start).lte('travel_date', end)` in the same case.
- [lib/auto-match.ts:58-65](../lib/auto-match.ts) — same skip.

The test at [lib/matching.test.ts:154-167](../lib/matching.test.ts)
explicitly asserts that `QR540` on `2026-05-10` matches a search dated
`2026-04-20`. That's the bug encoded as intent — the test also needs
updating.

## Repro

1. User A creates an offer: `flight_numbers = ['QR540']`, date `2026-04-20`.
2. User B searches for flight QR540 on `2026-05-10`.
3. Expected: no match.
4. Actual: A's trip is returned with `+200` flight-match score.

## Fix direction

Flight numbers are additive constraints, not replacements for the date
filter. Keep the date window on **both** branches:

```ts
// lib/matching.ts (rankTrips filter)
return trips.filter((t) => {
  const withinDate = dayDiff(t.travel_date, criteria.date) <= criteria.dateWindowDays;
  if (!withinDate) return false;
  if (usingFlightFilter) {
    return matchingFlightNumbers(t.flight_numbers, criteria.flightNumbers).length > 0;
  }
  return true;
});
```

And in [lib/search.ts:107-111](../lib/search.ts) / [lib/auto-match.ts:58-65](../lib/auto-match.ts),
stop gating the `travel_date` `.gte/.lte` on the "no flight numbers"
branch — always apply it. A `±1`-day window (the current default) is
fine for redeye / timezone fuzz.

## Structural fix

[ALGORITHM.md](ALGORITHM.md) stores legs with `(flight_number, travel_date)`.
Equality on both columns is a single index seek on
`trip_legs_flight_date_idx`; date is no longer optional.

## Tests to update

- Rewrite [lib/matching.test.ts:154-167](../lib/matching.test.ts) to
  assert the opposite: a flight-number match on a different day is
  filtered out.
- Add a new test: flight-number match on the same day passes.
- Add: flight-number match one day away (inside window) passes with the
  same `+200` score (flight match) and a `-5` day-delta penalty.

## Notes

- Update the doc comment at [lib/matching.ts:11-16](../lib/matching.ts)
  to say "flight number pins the physical flight _given a date window_" —
  not "flight number already uniquely identifies the departure".
- The whole point of this change is correctness, not aesthetics. Pairing
  this with #02's structural fix eliminates the entire class of
  "matched but not really on the same plane" errors.
