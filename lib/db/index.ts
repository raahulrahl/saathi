import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Single shared connection pool for the Next.js process. `prepare: false`
 * is non-negotiable: when DATABASE_URL eventually points at a transaction
 * pooler (PgBouncer / Supavisor / Neon pooler), named prepared statements
 * break — the pooler may route an EXECUTE to a connection that never saw
 * the PREPARE. Disabling it now means local dev behaves identically to
 * prod and there's nothing to flip later. The cost at our scale is negligible.
 */
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: Number(process.env.PGPOOL_MAX ?? 10),
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction with the request's identity bound to a
 * Postgres role + `request.jwt.claims` GUC, so every query is subject to
 * the RLS policies defined in db/migrations/*.sql.
 *
 *   * `clerkUserId` = a Clerk `sub` → role `authenticated`, claims set.
 *   * `clerkUserId === null` → role `anon`, claims cleared.
 *
 * Why a transaction:
 *   - postgres.js pools connections. `SET LOCAL ROLE` / `set_config(..., true)`
 *     are transaction-scoped, so they vanish at COMMIT/ROLLBACK and never
 *     leak to the next checkout. This is what makes the wrapper pooler-safe.
 *
 * Why role-name is `sql.raw` and claims-value is `${param}`:
 *   - `SET ROLE` cannot be parameterized (the target is an identifier, not a
 *     bind parameter). The role name is a compile-time constant from a 2-element
 *     allowlist — safe.
 *   - The claims JSON contains attacker-influenced data (a Clerk sub). It MUST
 *     be parameterized; never interpolated into `sql.raw`.
 *
 * IMPORTANT — error handling inside `fn`:
 *   - postgres.js re-raises a statement-level error at transaction commit
 *     even if you caught the JS-side promise rejection. So you CANNOT
 *     `try { tx.execute(…) } catch {}` an expected-failure probe and then
 *     continue running queries in the same transaction — the surrounding
 *     `withUser` will still throw when its tx commits. If you need to
 *     tolerate a failure, either (a) put the failing query in its own
 *     `withUser`/`withService` call wrapped in try/catch, or (b) use a
 *     SAVEPOINT (`tx.transaction(...)` in Drizzle creates a nested savepoint).
 *
 * Why fail-closed:
 *   - The app login role (`saathi_app`) is NOINHERIT and has no own table
 *     privileges. A code path that calls a query OUTSIDE this wrapper runs
 *     as bare `saathi_app` and gets `permission denied for table …`. This is
 *     intentional: it surfaces a missing wrapper loudly instead of silently
 *     bypassing RLS.
 */
export async function withUser<T>(
  clerkUserId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (clerkUserId) {
      await tx.execute(sql.raw('set local role authenticated'));
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: clerkUserId })}, true)`,
      );
    } else {
      await tx.execute(sql.raw('set local role anon'));
      // Clear any prior claims defensively (paranoia under pooled conns).
      await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);
    }
    return fn(tx);
  });
}

/**
 * Run `fn` as `service_role` (BYPASSRLS). Use for webhooks, cron, and any
 * background job that needs to write rows the user couldn't write themselves
 * (e.g. clerk-sync, the notification dispatcher, the auto-match job).
 *
 * The bypass is granted by `service_role` having the `BYPASSRLS` attribute
 * (set in 0000_bootstrap.sql). `SET LOCAL ROLE service_role` switches into
 * it; the attribute applies for the rest of the transaction.
 */
export async function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw('set local role service_role'));
    return fn(tx);
  });
}

export type DbTx = Tx;
