#!/usr/bin/env node
// scripts/migrate.mjs
//
// Minimal migration runner for raw SQL migrations under supabase/migrations.
// Replaces `supabase db push` / `db reset`.
//
// Behavior:
//   * Connects via DIRECT_DATABASE_URL (the superuser/owner role — needed
//     because migrations create SECURITY DEFINER functions whose owner must
//     own the tables they write to).
//   * Discovers files matching ^\d{4}_.+\.sql (skips the legacy timestamped
//     Supabase artifact `20260414201200_remote_commit.sql`).
//   * Applies them in lexical order (0000, 0001, …, 0024).
//   * Takes a session advisory lock so concurrent runs serialize.
//   * Tracks applied files in `_migrations(filename, checksum, applied_at)`.
//     Refuses to run if a previously-applied file's checksum has changed.
//   * Each file runs in its own transaction — all-or-nothing.
//
// Usage:
//   DIRECT_DATABASE_URL=postgres://raahuldutta@localhost:5432/saathi \
//     node scripts/migrate.mjs

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
  'migrations',
);
// Arbitrary 64-bit constant; any other migrate.mjs run on this DB takes the
// same lock and waits.
const ADVISORY_LOCK_KEY = 0x5341_4154_4849n; // 'SAATHI' in hex-ish

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error('DIRECT_DATABASE_URL is not set');
  process.exit(1);
}

// One connection, no pooling — this is a CLI.
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

async function main() {
  await sql`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
  try {
    await sql`
      create table if not exists public._migrations (
        filename   text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const files = await listMigrationFiles();
    const applied = new Map(
      (await sql`select filename, checksum from public._migrations`).map((r) => [
        r.filename,
        r.checksum,
      ]),
    );

    let appliedCount = 0;
    for (const filename of files) {
      const fullPath = path.join(MIGRATIONS_DIR, filename);
      const body = await readFile(fullPath, 'utf8');
      const checksum = sha256(body);

      const prior = applied.get(filename);
      if (prior) {
        if (prior !== checksum) {
          throw new Error(
            `migration ${filename} was edited after it was applied ` +
              `(checksum mismatch). Revert the edit or write a new migration.`,
          );
        }
        continue;
      }

      console.log(`→ ${filename}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          insert into public._migrations (filename, checksum)
          values (${filename}, ${checksum})
        `;
      });
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log('  (nothing to apply — DB is current)');
    } else {
      console.log(`✓ applied ${appliedCount} migration${appliedCount === 1 ? '' : 's'}`);
    }
  } finally {
    await sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
