# 05 — `/api/cron/auto-complete` auth fails open when `CRON_SECRET` unset

**Status:** ✅ FIXED in [lib/auth-guard.ts](../lib/auth-guard.ts) (new `requireCronSecret` helper, fails closed on missing secret) + [app/api/cron/auto-complete/route.ts](../app/api/cron/auto-complete/route.ts) (switched to the helper) (2026-04-18). Content below preserved for history.
**Severity:** HIGH
**Area:** API / auth
**Found:** 2026-04-18

## Failure mode

The auto-complete cron endpoint bulk-marks every active `match` as
completed (and flips trip status to `'completed'` via trigger). Its auth
check is guarded behind `if (expected)` — when `CRON_SECRET` is unset,
empty, or missing from the runtime, the guard is skipped and the
endpoint becomes fully public.

An anonymous HTTP GET to `/api/cron/auto-complete` then:

1. Marks every `matches` row where the linked trip's `travel_date` is
   more than 48h old as `poster_marked_complete = requester_marked_complete = true`.
2. The `handle_match_completion` trigger promotes the match to
   `status = 'completed'`.
3. The trigger cascades: trips get `status = 'completed'` too.
4. `reviews` gate opens (RLS on `public.reviews` only requires
   `m.status = 'completed'`) — an attacker has now unlocked the ability
   to write reviews for every match they're a party to, and silenced
   every active match for everyone else.

This is a classic "credential misconfig degrades to public endpoint" bug
and is especially bad on Vercel where an env var missing from a preview
environment is common.

## Where the bug lives

[app/api/cron/auto-complete/route.ts:11-17](../app/api/cron/auto-complete/route.ts)

```ts
const expected = process.env.CRON_SECRET;
if (expected) {
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
}
// falls through to the privileged work if expected is "" or undefined
```

## Repro

1. Deploy to a preview environment without `CRON_SECRET`.
2. `curl https://preview-url.vercel.app/api/cron/auto-complete`
3. Observe: `{ "ok": true, "updated": N }` with no auth challenge.
4. Check DB: every eligible match is now `completed`.

## Fix direction

Fail closed. If the secret is missing, refuse to do the privileged work:

```ts
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'cron secret not configured' }, { status: 500 });
  }
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  // ...privileged work...
}
```

Return `500` (not `401`) on missing secret so the preview deploy is
obviously broken rather than silently authless — forces the secret into
the preview env.

## Additional hardening

- Validate the Vercel cron header too: Vercel sets `x-vercel-cron: 1`
  when the request originates from its scheduler. Defense in depth, not
  a replacement for the bearer.
- The endpoint uses a `for...of` loop issuing one UPDATE per row
  ([app/api/cron/auto-complete/route.ts:34-44](../app/api/cron/auto-complete/route.ts)) —
  unrelated to this bug, but worth folding into a single
  `UPDATE matches SET ... WHERE id IN (...)` once the auth is closed.

## Tests to add

- Unit/integration: request without header → `401` when `CRON_SECRET` set;
  `500` when unset.
- Request with wrong header → `401` in both cases.
- Request with correct header → runs and returns `updated` count.

## Notes

- Same pattern likely exists in any future cron route — consider a shared
  `requireCronSecret(request)` helper in `lib/auth-guard.ts` so every
  cron handler has identical, audit-friendly auth.
