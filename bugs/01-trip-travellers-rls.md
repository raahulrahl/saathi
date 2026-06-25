# 01 — `trip_travellers` RLS blocks the matched companion from reading traveller PII

**Status:** ✅ FIXED in [db/migrations/0015_trip_travellers_match_read.sql](../db/migrations/0015_trip_travellers_match_read.sql) (2026-04-18)
**Severity:** HIGH
**Area:** database / RLS
**Found:** 2026-04-18
**Note:** originally filed as `01-trip-elders-rls.md` before the table
was renamed from `trip_elders` to `trip_travellers` in migration 0014.
Content below is preserved as-is for history; see the migration for
the applied fix.

## Failure mode

When a companion accepts a match with a family (request) trip, the match page
at [app/match/[id]/page.tsx:88-93](../app/match/[id]/page.tsx) fetches the
traveller rows so the companion can see who they're meeting. RLS on
`trip_travellers` silently returns an empty set, so the companion sees no
traveller details at all — defeating the whole purpose of the match handover.

The in-file comment at [app/match/[id]/page.tsx:86-87](../app/match/[id]/page.tsx)
claims _"trip owner and the accepted requester are the only authenticated
users who can read these rows"_ — the comment is aspirational; the policy
doesn't implement the "accepted requester" half.

## Where the bug lives

Defined in [db/migrations/0013_trip_elders.sql:33-48](../db/migrations/0013_trip_elders.sql),
carried through the rename in `0014_rename_trip_elders.sql`:

```sql
CREATE POLICY "trip_travellers owner full access"
  ON public.trip_travellers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id AND t.user_id = public.clerk_user_id()
    )
  )
  WITH CHECK ( ... same ... );
```

That's the _only_ SELECT-capable policy on `trip_travellers`. It grants
access only when the viewer is the trip owner (family). The matched
companion is never the trip owner on a `request` trip — they're
`matches.requester_id`.

## Repro

1. User A (family) creates a request trip with one traveller.
2. User B (companion) sends a match_request on A's trip.
3. A accepts. `matches` row is created with `poster_id=A, requester_id=B`.
4. B opens `/match/{id}`. The traveller list is empty. Check the page
   query at [app/match/[id]/page.tsx:88-93](../app/match/[id]/page.tsx) —
   it runs under B's JWT, so RLS gates it by `clerk_user_id() = B`,
   which fails the `t.user_id = clerk_user_id()` predicate.

## Fix direction

Add a second SELECT policy that grants access to anyone on an active or
completed match for that trip:

```sql
CREATE POLICY "trip_travellers: match participants read"
  ON public.trip_travellers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.trip_id = trip_travellers.trip_id
        AND (m.poster_id = public.clerk_user_id()
             OR m.requester_id = public.clerk_user_id())
    )
  );
```

Keep the existing `FOR ALL` policy for owner writes — Postgres RLS is
permissive (OR across policies for the same command), so adding this
SELECT-only policy won't open up writes.

## New migration

`db/migrations/0015_trip_travellers_match_read.sql` — lands after
the 0014 rename, before any graph-matching migrations (see
[ALGORITHM.md](ALGORITHM.md)).

## Tests to add

- pgTAP / RLS test: as user B (companion with accepted match on trip T),
  `SELECT * FROM trip_travellers WHERE trip_id = T` returns the rows.
- As user C (random authenticated user with no match on T), the same
  query returns zero rows.

## Notes

- Do **not** base the policy on `match_requests.status = 'accepted'` —
  the trigger promotes accepted match_requests to a `matches` row, and
  that's the authoritative marker. Checking `matches` is one join;
  checking both tables is two.
- Once fixed, remove the stale comment at
  [app/match/[id]/page.tsx:86-87](../app/match/[id]/page.tsx) that
  describes the policy as already-correct.
