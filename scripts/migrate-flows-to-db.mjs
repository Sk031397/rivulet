/**
 * One-time migration: import flows.json into the Postgres `flows` table.
 *
 * Usage (after setting DATABASE_URL in your environment or .env):
 *   node --env-file=.env scripts/migrate-flows-to-db.mjs
 *
 * Safe to run more than once — it upserts by flow id, so re-running won't
 * create duplicates. It never deletes anything.
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env scripts/migrate-flows-to-db.mjs");
  process.exit(1);
}

const jsonPath = path.join(process.cwd(), "flows.json");
if (!fs.existsSync(jsonPath)) {
  console.log("No flows.json found — nothing to migrate.");
  process.exit(0);
}

let flows;
try {
  flows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
} catch (e) {
  console.error("Could not parse flows.json:", e.message);
  process.exit(1);
}

if (!Array.isArray(flows) || flows.length === 0) {
  console.log("flows.json is empty — nothing to migrate.");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

try {
  // Ensure the schema exists (mirrors src/lib/db.ts).
  await sql`
    create table if not exists flows (
      id         text primary key,
      owner_id   text,
      data       jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists flows_owner_id_idx on flows (owner_id)`;

  let imported = 0;
  for (const flow of flows) {
    if (!flow?.id) {
      console.warn("Skipping a flow with no id:", flow?.name ?? "(unnamed)");
      continue;
    }
    await sql`
      insert into flows (id, owner_id, data)
      values (${flow.id}, ${flow.ownerId ?? null}, ${sql.json(flow)})
      on conflict (id) do update
        set owner_id = excluded.owner_id,
            data     = excluded.data
    `;
    imported++;
  }

  console.log(`Migrated ${imported} flow(s) into the database.`);
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
