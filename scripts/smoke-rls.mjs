#!/usr/bin/env node
// scripts/smoke-rls.mjs
//
// Phase 1 smoke test for the Drizzle wrappers' SQL pattern.
//
// We can't `import '@/lib/db'` here because that file has `import 'server-only'`,
// which throws under raw Node. We inline a copy of withUser/withService that
// uses the exact same SQL — proving the pattern works against the schema's
// RLS through Drizzle (the psql smoke in Phase 0 already proved the policies
// themselves enforce; this verifies the TS wrapper composes correctly).
//
// Run:
//   DATABASE_URL=postgres://saathi_app:dev@localhost:5432/saathi pnpm tsx scripts/smoke-rls.mjs

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { profiles, trips, publicTrips } from '../lib/db/schema.ts';

const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 5 });
const db = drizzle(client);

async function withUser(clerkUserId, fn) {
  return db.transaction(async (tx) => {
    if (clerkUserId) {
      await tx.execute(sql.raw('set local role authenticated'));
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: clerkUserId })}, true)`,
      );
    } else {
      await tx.execute(sql.raw('set local role anon'));
      await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);
    }
    return fn(tx);
  });
}

async function withService(fn) {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw('set local role service_role'));
    return fn(tx);
  });
}

let ok = true;
const assert = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) ok = false;
};

try {
  await withService(async (tx) => {
    await tx.execute(sql`delete from public.profiles where id in ('user_alice','user_bob')`);
    await tx.insert(profiles).values([
      { id: 'user_alice', role: 'family',    displayName: 'Alice' },
      { id: 'user_bob',   role: 'companion', displayName: 'Bob' },
    ]);
    await tx.insert(trips).values({
      userId: 'user_alice',
      kind: 'request',
      route: ['CCU', 'AMS'],
      travelDate: '2026-08-01',
      languages: ['en', 'hi'],
      genderPreference: 'any',
      helpCategories: ['mobility'],
      status: 'open',
      notes: 'private notes for alice trip',
    });
  });
  console.log('seeded alice + bob + trip');

  await withUser(null, async (tx) => {
    const rows = await tx.select().from(publicTrips);
    assert(rows.length >= 1, `anon sees public_trips (${rows.length} rows)`);
  });

  // Expected-failure probe in its OWN transaction. postgres.js re-raises a
  // statement error at COMMIT time even if JS caught it, so mixing expected
  // failures with assertions in one tx corrupts the result of the WHOLE block.
  let leaked = false;
  try {
    await withUser(null, async (tx) => {
      await tx.execute(sql`select notes from public.trips limit 1`);
      leaked = true;
    });
  } catch {
    // expected
  }
  assert(!leaked, 'anon blocked from trips.notes');

  await withUser('user_alice', async (tx) => {
    const rows = await tx
      .select({ notes: trips.notes })
      .from(trips)
      .where(eq(trips.userId, 'user_alice'));
    assert(
      rows[0]?.notes === 'private notes for alice trip',
      `alice reads own notes`,
    );
  });

  await withUser('user_bob', async (tx) => {
    const updated = await tx
      .update(trips)
      .set({ notes: 'hijacked' })
      .where(eq(trips.userId, 'user_alice'))
      .returning({ id: trips.id });
    assert(updated.length === 0, `RLS blocks bob updating alice's trip`);
  });

  await withService(async (tx) => {
    await tx.execute(sql`delete from public.profiles where id in ('user_alice','user_bob')`);
  });
  console.log('cleaned up');
} catch (e) {
  console.error('uncaught:', e);
  ok = false;
} finally {
  await client.end({ timeout: 1 });
}

if (!ok) process.exit(1);
console.log('\nALL CHECKS PASSED');
