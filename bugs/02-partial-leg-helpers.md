# 02 — Partial-leg helpers never match (the DOH→AMS student case)

**Severity:** HIGH
**Area:** search / matching
**Found:** 2026-04-18
**Related:** [ALGORITHM.md](ALGORITHM.md) (structural fix)

## Failure mode

The project exists because a student flying one leg of an international
itinerary can help an elderly passenger on the same aircraft. The current
matcher excludes exactly those students.

If mother posts a request with `route = ['CCU', 'DOH', 'AMS']` and a
student posts an offer with `route = ['DOH', 'AMS']` (they're only flying
the second leg), the student's trip will **never** surface on the mother's
search page and **never** trigger a notification to the mother on creation.

## Where the bug lives

Two places, same shape:

[lib/search.ts:96-111](../lib/search.ts)

```ts
let query = supabase
  .from('public_trips')
  ...
  .contains('route', [params.from])
  .contains('route', [params.to]);
```

[lib/auto-match.ts:49-56](../lib/auto-match.ts)

```ts
let query = supabase
  .from('trips')
  ...
  .contains('route', [origin])
  .contains('route', [destination]);
```

`.contains('route', [X])` is Postgres `route @> ARRAY[X]` — it requires X
to appear in the trip's route array. Chained, it requires **both** origin
AND destination to be in the student's route. Student's route `['DOH','AMS']`
doesn't contain `'CCU'`, so it's filtered out before scoring.

`lib/matching.ts::routeMatch()` has a `'one-leg'` band that would have
scored the student correctly (`+5`), but the DB query drops them before the
scorer runs.

## Repro

1. User A (family) creates request: `route = ['CCU','DOH','AMS']`, date D.
2. User B (companion) creates offer: `route = ['DOH','AMS']`, date D.
3. Expected: B appears on A's search results; A gets an auto-match email.
4. Actual: B is invisible to A in both flows.

## Fix direction — short term

Relax the query: require the **destination** to be present (because that's
the most specific constraint), then let the in-memory scorer at
[lib/matching.ts:78-101](../lib/matching.ts) handle the subtleties. Replace
both sites with something like:

```ts
.or(`route.cs.{${from}},route.cs.{${to}}`)  // contains either
```

and broaden `routeMatch()` to correctly score a student whose route is a
sub-sequence of the family's route, in the same direction.

This unblocks the feature but leaves the full-table-scan problem in place:
every search reads every open trip whose route contains either airport.
Fine for launch; not fine at scale.

## Fix direction — structural (recommended)

Decompose every trip into leg rows and match on legs, not paths. See
[ALGORITHM.md](ALGORITHM.md) — `trip_legs` table + `(origin,destination,
travel_date)` composite index + `(flight_number, travel_date)` partial
index. The matching query becomes a join on `searcher_legs`, indexed,
`O(L × log N)`.

Landing the structural fix also closes [03-route-direction.md](03-route-direction.md)
(direction is baked into leg rows) and gives [04-flight-number-ignores-date.md](04-flight-number-ignores-date.md)
an obvious home (`(flight_number, travel_date)` equality).

## Tests to add

- `rankTrips` unit test: searcher `{origin:CCU, destination:AMS, via:[DOH]}`
  matches a trip with `route:['DOH','AMS']` with `routeMatch = 'one-leg'`
  and non-zero score.
- Integration test against a seeded Supabase: the full search flow returns
  the partial-leg student.
- Auto-match test: creating the family's request on top of the student's
  existing offer surfaces the student in `findMatchingTrips()`.

## Notes

- Don't "fix" this by loosening `.contains()` to `.overlaps()` — that
  matches any trip that shares an airport, including unrelated itineraries
  passing through DOH.
- The comment at the top of [lib/matching.ts:4-33](../lib/matching.ts)
  describes a scorer that already handles partial overlap. The scorer does;
  the upstream DB query throws the candidates away before the scorer sees
  them. Update that comment once this is fixed.
