# Medium-severity bugs

Correctness / reliability holes that will bite under real traffic but
aren't blocking launch to a small beta.

---

## M01 — `/api/flights/lookup` has no auth or rate limit

**File:** [app/api/flights/lookup/route.ts:142-347](../app/api/flights/lookup/route.ts)

Anonymous POST; each cache miss burns AirLabs quota. The file-top comment
even notes rate limiting was removed. A trivial script can empty the
AirLabs quota and poison `flight_cache` with rows for garbage flight
numbers.

**Fix:**

1. Require a signed-in Clerk user (the endpoint is only used from the
   post wizard anyway).
2. Reject flight numbers that don't match `^[A-Z]{1,3}\d{1,4}$` before
   cache lookup.
3. Add a per-user token bucket (pg-based counter or re-add Upstash).

---

## M02 — Flight-number field accepts any 10-char string

**File:** [app/post/actions.ts:46](../app/post/actions.ts)

`z.array(z.string().max(10))` allows `"   "`, `"qr 540"`, `"QR-540"`,
`"hello12"`. `lib/matching.ts::normaliseFlight` uppercases + strips
whitespace at _read_ time, so `"qr 540"` and `"QR540"` compare equal —
but `"QR-540"` and `"QR540"` don't.

**Fix:** normalize + validate once, at write time:

```ts
flight_numbers: z.array(
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}\d{1,4}$/),
)
  .optional()
  .default([]);
```

Store canonical form. Delete `normaliseFlight` once storage is clean.

---

## M03 — Auto-match + notify is fire-and-forget inside a redirecting Server Action

**File:** [app/post/actions.ts:150-158](../app/post/actions.ts)

```ts
findAndNotifyMatches({ ... })
  .catch((err) => console.error('[auto-match] notification failed:', err));
redirect(`/trip/${created.id}?new=true`);
```

Vercel kills the serverless invocation once the response is flushed. A
non-trivial share of posts will never dispatch their notifications — and
there's no retry path. Worse: there's also no "this was meant to be
sent" audit row, so the miss is invisible.

**Fix, short term:**

`await findAndNotifyMatches(...)` before `redirect`. Typical latency is
sub-second; trip creation is not a hot path.

**Fix, proper:**

Persist a `pending_notifications` row in the same transaction as the
trip insert. A cron / Inngest / Trigger.dev worker processes the queue.
Gives you retries + idempotency.

---

## M04 — No notification dedupe

**File:** [lib/notify.ts:99-165](../lib/notify.ts)

Nothing records "user X was notified about trip Y." If the Server
Action re-runs (transient network error at redirect time), or the user
deletes + re-posts a similar trip, candidates get spammed.

**Fix:** `public.notifications_sent (new_trip_id, recipient_user_id, channel, sent_at)`
with `primary key (new_trip_id, recipient_user_id, channel)`. Check
before each send; write on success.

---

## M05 — Moderation fails open without a queue

**File:** [lib/moderation.ts:34-64](../lib/moderation.ts)

When `OPENAI_API_KEY` is missing or the OpenAI call errors, every trip
passes. The file comment promises an "admin queue (see Product Spec
§6.1)" — the queue doesn't exist in the tree (no `app/admin/**`, no
`moderation_queue` table).

**Fix:** either build the queue, or at minimum write a
`moderation_pending` row (trip_id, text, reason_for_skip) on every
fail-open so a human sweep can catch what OpenAI would have caught.

---

## M06 — Race on concurrent `accept` for sibling match_requests

**File:** [supabase/migrations/0005_clerk.sql:385-415](../supabase/migrations/0005_clerk.sql)

`handle_match_request_accepted` inserts into `matches` and then updates
`trips.status = 'matched' WHERE status = 'open'`. The `matches` uniqueness
constraint is `unique (match_request_id)` — that stops double-promoting
the _same_ request, not two _different_ requests on the same trip.

If the trip owner accepts two pending requests in flight (two tabs, fast
API clicks), both can produce `matches` rows because neither trigger sees
the other's `matched` flip yet. `auto_declined` sweeps siblings, but only
after the insert already happened.

**Fix:** first-write-wins inside the trigger:

```sql
UPDATE public.trips
   SET status = 'matched'
 WHERE id = new.trip_id AND status = 'open'
 RETURNING 1;

IF NOT FOUND THEN
  RAISE EXCEPTION 'trip % is no longer open', new.trip_id;
END IF;
```

Do that **before** the `INSERT INTO matches`. Second accept errors
cleanly; the UI can refetch and show "this trip is already matched."

---

## M07 — `blocks` table is defined but never consulted in RLS

**Files:** [supabase/migrations/0001_init.sql:193-199](../supabase/migrations/0001_init.sql),
[supabase/migrations/0005_clerk.sql:224-230](../supabase/migrations/0005_clerk.sql)

`blocks` exists. It does nothing. A blocked user can still send a
match_request on a trip owned by the user who blocked them.

**Fix:** add `AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = t.user_id AND b.blocked_id = clerk_user_id())`
to the `match_requests: requester insert` policy in
[0005_clerk.sql:277-286](../supabase/migrations/0005_clerk.sql). Consider
mirroring the check in `messages: participants send`.

---

## M08 — Trip rollback is not transactional

**File:** [app/post/actions.ts:134-144](../app/post/actions.ts)

When the traveller insert fails, the code issues a plain `delete` on the
trip. If the delete _also_ fails (network blip, RLS misfire), you leak
a trip row with no traveller data on `/search`.

**Fix:** wrap both inserts in a Postgres function (`rpc`) so they're a
single transaction, or move traveller rows inline on the trips insert
via Postgres JSON → trigger expansion. Either is a real fix; the
current two-step delete-on-failure is best-effort.

---

## M09 — `notes` is free-text and anon-readable via `public_trips`

**File:** [supabase/migrations/0013_trip_elders.sql:96](../supabase/migrations/0013_trip_elders.sql) (view later rebuilt in 0014)

Per `CLAUDE.md` memory, anon-readable `public_trips` is **intentional**
pre-launch (discovery > privacy while the flywheel spins up). Leaving
this here as awareness, not a bug-to-fix:

Before launch, decide: either strip `notes` from the anon view and
only show after auth, or run a PII regex on submit
(`/\+?\d[\d\s\-]{7,}/` for phone, RFC-ish email regex) so users can't
bypass the match-gate by pasting "whatsapp me: +1-555-…" in notes.
