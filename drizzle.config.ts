import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle is used as a typed CLIENT over a schema owned by raw SQL
 * (supabase/migrations/*.sql). We only ever run `drizzle-kit pull` —
 * never `generate` or `push`. The pull regenerates lib/db/schema.ts
 * from the live DB; views and CHECK-driven enums then get hand-fixed.
 *
 * Introspection requires the superuser URL (pull reads pg_catalog and
 * sequences that the app role can't see).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle', // unused (no generate/push); harmless
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL!,
  },
  schemaFilter: ['public'],
  // Skip the bookkeeping table the migration runner uses.
  tablesFilter: ['!_migrations'],
  verbose: false,
  strict: true,
});
