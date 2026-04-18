# 03 — `routeMatch()` is direction-blind

**Severity:** HIGH
**Area:** matching
**Found:** 2026-04-18

## Failure mode

`routeMatch()` in `lib/matching.ts` returns `'endpoints'` (worth `+15`
score) whenever a trip's route contains both the searcher's origin and
destination — regardless of the order they appear in. A traveller on the
**return** leg will be scored as a valid match.

A student flying `['AMS','DOH','CCU']` (returning home from Europe) shows
up as an `'endpoints'` match for a search `origin=CCU, destination=AMS`,
because both `'CCU'` and `'AMS'` are in the array. The student is going
the opposite direction and cannot help. They'll appear in the ranked
results.

## Where the bug lives

[lib/matching.ts:78-101](../lib/matching.ts)

```ts
export function routeMatch(
  tripRoute: string[],
  origin: string,
  destination: string,
): Scored['routeMatch'] {
  if (tripRoute.length < 2) return 'none';
  const start = tripRoute[0]!;
  const end = tripRoute[tripRoute.length - 1]!;
  if (start === origin && end === destination) {
    return tripRoute.length === 2 ? 'exact' : 'endpoints';
  }
  if (tripRoute.includes(origin) && tripRoute.includes(destination)) {
    return 'endpoints'; // ← no direction check
  }
  if (
    start === origin ||
    end === destination ||
    tripRoute.includes(origin) ||
    tripRoute.includes(destination)
  ) {
    return 'one-leg';
  }
  return 'none';
}
```

The second branch and the `'one-leg'` branch both fire on reverse routes.

## Repro

```ts
routeMatch(['AMS', 'DOH', 'CCU'], 'CCU', 'AMS'); // returns 'endpoints'; should be 'none'
routeMatch(['AMS', 'CCU'], 'CCU', 'AMS'); // returns 'endpoints'; should be 'none'
```

The scorer then awards `+15` for a match that cannot physically exist.

## Fix direction

Require that `destination` appears _after_ `origin` in the trip's route
array. A minimal rewrite:

```ts
export function routeMatch(
  tripRoute: string[],
  origin: string,
  destination: string,
): Scored['routeMatch'] {
  if (tripRoute.length < 2) return 'none';
  const oIdx = tripRoute.indexOf(origin);
  const dIdx = tripRoute.indexOf(destination);
  const inOrder = oIdx !== -1 && dIdx !== -1 && dIdx > oIdx;

  if (inOrder) {
    const sameEndpoints = oIdx === 0 && dIdx === tripRoute.length - 1;
    return sameEndpoints && tripRoute.length === 2
      ? 'exact'
      : sameEndpoints
        ? 'endpoints'
        : 'endpoints'; // origin/dest are interior but still in order
  }

  // one-leg overlap: origin appears as a departure, OR destination appears as an arrival
  if ((oIdx !== -1 && oIdx < tripRoute.length - 1) || (dIdx !== -1 && dIdx > 0)) {
    return 'one-leg';
  }

  return 'none';
}
```

(Adjust exactly how you want interior-endpoint matches to score; the point
is the `dIdx > oIdx` guard.)

## Structural fix

Once [ALGORITHM.md](ALGORITHM.md) lands and matching is done on
`trip_legs` rows rather than on whole routes, direction is implicit:
each leg is a `(origin, destination)` _directed_ edge. This bug stops
being expressible.

## Tests to add

In [lib/matching.test.ts](../lib/matching.test.ts):

```ts
it('rejects reverse-direction routes', () => {
  expect(routeMatch(['AMS', 'DOH', 'CCU'], 'CCU', 'AMS')).toBe('none');
  expect(routeMatch(['AMS', 'CCU'], 'CCU', 'AMS')).toBe('none');
});
```

The existing test at `lib/matching.test.ts:47-49` asserting
`routeMatch(['CCU','DOH','AMS'],'CCU','AMS') === 'endpoints'` should still
pass.
