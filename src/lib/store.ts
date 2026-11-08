/**
 * Postgres-backed flow store (Supabase).
 *
 * Flows are scoped to their owner (Clerk user id). Owner-facing reads/writes
 * must pass an `ownerId` and can only see or mutate that user's flows.
 * A few internal paths (PayPal capture/webhook reconciliation) look a flow up
 * by id alone — those use the explicitly-unscoped helpers.
 *
 * Every function is async. Read-modify-write updates run inside a transaction
 * with `select … for update` row locking so concurrent requests can't clobber
 * each other (the bug the old flows.json store had).
 */

import type { Flow } from "@/data/dashboard";
import { getSql, ensureSchema } from "./db";

/** Rows store the full Flow in a jsonb `data` column. */
interface FlowRow {
  data: Flow;
}

/** Cast a Flow to the driver's JSON parameter type (Flow is JSON-serializable). */
function asJson(flow: Flow) {
  return flow as unknown as Parameters<ReturnType<typeof getSql>["json"]>[0];
}

/** Return the flows owned by `ownerId`, newest first. */
export async function getAllFlows(ownerId: string): Promise<Flow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql<FlowRow[]>`
    select data from flows
    where owner_id = ${ownerId}
    order by created_at desc
  `;
  return rows.map((r) => r.data);
}

/**
 * Look up a single flow by id, WITHOUT owner scoping. Reserved for internal
 * reconciliation (PayPal capture/webhook) where no owner session exists.
 * Do not use this to serve owner-facing data.
 */
export async function getFlowByIdUnscoped(id: string): Promise<Flow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql<FlowRow[]>`select data from flows where id = ${id} limit 1`;
  return rows[0]?.data ?? null;
}

/** Save a new flow (upsert — replaces if same id exists). */
export async function saveFlow(flow: Flow): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    insert into flows (id, owner_id, data)
    values (${flow.id}, ${flow.ownerId ?? null}, ${sql.json(asJson(flow))})
    on conflict (id) do update
      set owner_id = excluded.owner_id,
          data     = excluded.data
  `;
}

/**
 * Update a flow owned by `ownerId` and persist. Returns the updated flow, or
 * null if the flow doesn't exist OR is owned by someone else (callers can't
 * distinguish — both are "not yours"). Runs in a locking transaction.
 */
export async function updateFlow(
  id: string,
  ownerId: string,
  patch: (flow: Flow) => void,
): Promise<Flow | null> {
  await ensureSchema();
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<FlowRow[]>`
      select data from flows where id = ${id} and owner_id = ${ownerId} for update
    `;
    const flow = rows[0]?.data;
    if (!flow) return null;
    patch(flow);
    await tx`update flows set data = ${tx.json(asJson(flow))} where id = ${id}`;
    return flow;
  });
}

/**
 * Update a flow by id WITHOUT owner scoping. Reserved for internal
 * reconciliation (PayPal capture/webhook). Returns the updated flow or null.
 */
export async function updateFlowUnscoped(
  id: string,
  patch: (flow: Flow) => void,
): Promise<Flow | null> {
  await ensureSchema();
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<FlowRow[]>`select data from flows where id = ${id} for update`;
    const flow = rows[0]?.data;
    if (!flow) return null;
    patch(flow);
    await tx`update flows set data = ${tx.json(asJson(flow))} where id = ${id}`;
    return flow;
  });
}

/** Delete a flow owned by `ownerId`. Returns true if a flow was removed. */
export async function deleteFlow(id: string, ownerId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const result = await sql`delete from flows where id = ${id} and owner_id = ${ownerId}`;
  return result.count > 0;
}
