# Graph-based matching — the data-model fix

**Status:** design proposal, not yet implemented
**Owner:** open
**Addresses:** [02-partial-leg-helpers.md](02-partial-leg-helpers.md) (structural),
[03-route-direction.md](03-route-direction.md) (implicit), [04-flight-number-ignores-date.md](04-flight-number-ignores-date.md) (clean home)

---

## The core mistake

Saathi today stores a trip's route as a flat `text[]` of IATA codes and
matches on _"does this array contain both endpoints?"_. That loses the
two things travelers actually share:

1. **Legs** — consecutive `(origin, destination)` pairs on a given date.
2. **Flights** — `(flight_number, date)` identifies a physical aircraft.

A student on DOH→AMS can help a parent on CCU→DOH→AMS because they share
**leg 2**. Today's query excludes exactly those helpers (see bug #02).

## What users actually match on

A trip is a directed walk through the airport graph. The matchable unit
is the **edge** (leg), not the path. Mother's CCU→DOH→AMS is:

```
leg 0: CCU → DOH on day D   flight QR540
leg 1: DOH → AMS on day D   flight QR23
```

The student flying only DOH→AMS has:

```
leg 0: DOH → AMS on day D   flight QR23
```

Match iff **any leg overlaps**, ranked by how specific the overlap is
(same flight_number > same (origin,destination,date) > same
(origin,destination) within a date window).

## Schema

New migration: `supabase/migrations/0014_trip_legs.sql`.

```sql
create table public.trip_legs (
  id              uuid        primary key default gen_random_uuid(),
  trip_id         uuid        not null references public.trips(id) on delete cascade,
  leg_index       int         not null,          -- 0-based position in route
  origin          text        not null,          -- IATA
  destination     text        not null,          -- IATA
  travel_date     date        not null,          -- date of this leg's departure
  flight_number   text,                          -- canonical form; null allowed
  created_at      timestamptz not null default now(),
  unique (trip_id, leg_index)
);

-- Hot path: "legs matching (o, d, date)" — single index seek.
create index trip_legs_od_date_idx
  on public.trip_legs (origin, destination, travel_date);

-- Strongest signal: "legs matching (flight_number, date)".
-- Partial index — only rows with a flight_number — keeps it small.
create index trip_legs_flight_date_idx
  on public.trip_legs (flight_number, travel_date)
  where flight_number is not null;

-- RLS: mirror trips. Anon read the raw rows (pre-launch discovery
-- posture from CLAUDE.md memory), owner writes.
alter table public.trip_legs enable row level security;
create policy "trip_legs: public read"   on public.trip_legs for select using (true);
create policy "trip_legs: owner writes"  on public.trip_legs
  for all using (
    exists (select 1 from public.trips t where t.id = trip_legs.trip_id and t.user_id = public.clerk_user_id())
  ) with check (
    exists (select 1 from public.trips t where t.id = trip_legs.trip_id and t.user_id = public.clerk_user_id())
  );
```

### Sync trigger

```sql
create or replace function public.rebuild_trip_legs()
returns trigger language plpgsql as $$
begin
  delete from public.trip_legs where trip_id = new.id;
  insert into public.trip_legs (trip_id, leg_index, origin, destination, travel_date, flight_number)
  select new.id,
         i - 1,
         new.route[i],
         new.route[i + 1],
         new.travel_date,
         case
           when new.flight_numbers is not null
                and array_length(new.flight_numbers, 1) >= i
           then new.flight_numbers[i]
           else null
         end
    from generate_subscripts(new.route, 1) as i
   where i < array_length(new.route, 1);
  return new;
end;
$$;

create trigger trip_legs_sync
  after insert or update of route, travel_date, flight_numbers on public.trips
  for each row execute function public.rebuild_trip_legs();

-- Backfill once:
insert into public.trip_legs (trip_id, leg_index, origin, destination, travel_date, flight_number)
select t.id, i - 1, t.route[i], t.route[i+1], t.travel_date,
       case when t.flight_numbers is not null and array_length(t.flight_numbers,1) >= i
            then t.flight_numbers[i] end
  from public.trips t,
       generate_subscripts(t.route, 1) as i
 where i < array_length(t.route, 1);
```

**Caveat.** The alignment `flight_numbers[i] ↔ route[i]→route[i+1]`
requires the post wizard to enforce it. Today `flight_numbers` is a
loose array with no index alignment guarantee. Either:

- (Preferred) Rework the post wizard to collect legs-with-flights as
  one structured list, and derive `route`/`flight_numbers` on submit.
- (Stopgap) Treat mismatched lengths as "no flight number for this leg"
  and fall back to `(origin, destination, date)` match.

## The query

Given a search (`origin=CCU, destination=AMS, via=[DOH], date=D, ±1, flight_numbers=['QR540','QR23']`):

```sql
with searcher_legs as (
  select unnest(array['CCU','DOH']) as o,
         unnest(array['DOH','AMS']) as d,
         unnest(array['QR540','QR23']) as fn,
         date 'D' as dt
),
candidates as (
  -- Strongest: same flight_number, same date.
  select l.trip_id, 100 as leg_score
    from public.trip_legs l
    join searcher_legs s
      on l.flight_number = s.fn
     and l.travel_date   = s.dt
  union all
  -- Weaker: same (origin, destination) within ±1 day.
  select l.trip_id, 40 as leg_score
    from public.trip_legs l
    join searcher_legs s
      on l.origin      = s.o
     and l.destination = s.d
     and l.travel_date between s.dt - 1 and s.dt + 1
)
select trip_id, sum(leg_score) as score
  from candidates
 group by trip_id
 order by score desc
 limit 50;
```

The planner collapses each join into an index seek. Cost is
`O(L × log N)` where `L = legs in searcher's route` (≤ 4 in practice)
and `N = open legs in the date window`. At 10k trips/day × ~3 legs,
N ≈ 30k/day; a 3-day window is ~90k rows; each index lookup is
microseconds.

Return the trip ids from SQL; let `lib/matching.ts::scoreTrip` add the
language / review adjustments in application code. Current in-memory
filter stops being needed.

## Where Bloom filters actually fit

You asked about Bloom filters specifically. They're a great instinct,
and they **don't** fit the hot path — for exact-match lookups a B-tree
is strictly better (no false positives, same `O(log N)`). Where they do
earn their keep here:

### Postgres `bloom` indexes

`CREATE EXTENSION bloom; CREATE INDEX … USING bloom (a, b, c, d, e)` —
these shine when a query filters on **many equality columns** and you'd
otherwise need `2^k` composite B-trees to cover every subset.

If matching grows to `(origin, destination, travel_date, gender_preference,
help_categories, traveller_age_bands)` simultaneous-equality queries, **one**
bloom index replaces the combinatorial explosion of B-trees. Cost: bloom
is probabilistic, so the planner still does a recheck on the heap.

**Don't add until you see the query pattern** — starting with B-trees on
the common prefixes is cheaper and debuggable.

### Application-side Bloom as a negative cache

At millions of trips, you may want to short-circuit "does trip A have
_any_ leg overlap with trip B?" without a Postgres round-trip. Keep a
per-day Bloom filter of `(origin, destination, travel_date)` tuples in
Redis. Test-membership is microseconds; false positives fall through to
SQL.

Useful at scale. **Premature pre-launch.**

## Graph upgrades for later

Listed in order of "when growth demands it":

### 1. Connecting-flight composition (real graph traversal)

Today a single companion must cover the whole shared segment. But if
companion X covers CCU→DOH and companion Y covers DOH→AMS, a family's
CCU→AMS request can be _decomposed_ into two handoffs — a chain.

BFS on `trip_legs` treated as a graph (nodes = airports × dates, edges =
leg rows). Search from `origin` to `destination` within a date window;
each edge is a (possible) companion. Cap depth ≤ request's leg count;
cap fanout per node ≤ 20; score chains by total language overlap +
fewest handoffs. Store results in `match_proposals` (proposed chains of
companion_ids) so you can present "a team of two can cover your route."

Significant UX work — offer the single-companion path first, propose
chains only when no single match exists.

### 2. Hub partitioning

DOH, DXB, IST, SIN, FRA will dominate edge counts. Partition
`trip_legs` by `RANGE (travel_date)` monthly (use `pg_partman`); for
the top-10 hub airports, sub-partition by `origin`. Keeps index pages
hot and bounds working-set size.

### 3. Temporal graph: ingest flight schedules

You already cache AirLabs data in `flight_cache`. Extend it to ingest
full forward-looking schedules, nodes = `(airport, datetime)`, edges =
scheduled flights. Match trips against the schedule graph, not just
against other trips. Lets you suggest "fly QR541 on Apr 20, you'll be
on the same plane as this family."

High upside for the parents-don't-have-anyone-yet case. High build
cost. Deferred until you have the traffic to justify.

### 4. MinHash / LSH

Only if you build a "trips like yours" recommender. Not a matching
concern.

## Recommended landing order

1. Fix HIGH bugs `01`–`05` — all small, mostly independent.
2. Ship the `0014_trip_legs.sql` migration + trigger + backfill.
3. Rewrite `lib/matching.ts::rankTrips` to consume `trip_id[]`
   candidates from the SQL query above; drop the in-memory route filter.
4. Rewrite `lib/search.ts` + `lib/auto-match.ts` to use the new query.
   Remove the `.contains('route', [...])` pattern.
5. Add `notifications_sent` + backup cron ([MEDIUM.md](MEDIUM.md) M03, M04).
6. Then whatever comes next — moderation queue, hub partitioning, etc.
