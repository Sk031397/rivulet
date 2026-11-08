/**
 * Postgres connection + schema for the flow store.
 *
 * Uses the `postgres` driver against a Supabase (or any) Postgres instance.
 * The connection string comes from DATABASE_URL. For Supabase, use the
 * "Connection pooling" (pgBouncer, port 6543) string so it works on serverless
 * — add `?sslmode=require` if your string doesn't already include SSL params.
 *
 * Flows are stored one row per flow:
 *   id        text primary key   — the flow's id
 *   owner_id  text               — Clerk user id (null for legacy/unclaimed)
 *   data      jsonb              — the full Flow object
 *   created_at timestamptz       — insertion time, used for "newest first"
 */

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

/**
 * A lazily-created singleton client. We keep it on globalThis in dev so Next's
 * hot-reload doesn't open a new pool on every change.
 */
const globalForDb = globalThis as unknown as { __rivuletSql?: ReturnType<typeof postgres> };

export function getSql() {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Supabase Postgres connection string to .env.",
    );
  }
  if (!globalForDb.__rivuletSql) {
    globalForDb.__rivuletSql = postgres(connectionString, {
      // pgBouncer (Supabase pooler) doesn't support prepared statements.
      prepare: false,
      // Keep the serverless footprint small.
      max: 1,
      idle_timeout: 20,
    });
  }
  return globalForDb.__rivuletSql;
}

/** Whether a database connection string is configured. */
export function hasDatabase(): boolean {
  return Boolean(connectionString);
}

let schemaReady: Promise<void> | null = null;

/**
 * Ensure the `flows` table exists. Runs once per process (memoized). Safe to
 * call before every query — it's a no-op after the first success.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        create table if not exists flows (
          id         text primary key,
          owner_id   text,
          data       jsonb not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists flows_owner_id_idx on flows (owner_id)`;
    })().catch((err) => {
      // Reset so a transient failure can be retried on the next call.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
