/**
 * Shared contribution rules. Pure (no server or browser APIs) so the pay page,
 * the /api routes, and tests all run exactly the same logic.
 */

import type { Flow } from "@/data/dashboard";

/** Smallest contribution accepted, in USD. */
export const MIN_CONTRIBUTION = 1;

/**
 * A payout run is "in flight" if one started recently. Runs older than this are
 * treated as abandoned (e.g. the server died mid-run) so a flow can't get stuck.
 */
export const DISBURSE_LOCK_MS = 2 * 60 * 1000;

export function isDisbursing(flow: { disbursingAt?: string }): boolean {
  if (!flow.disbursingAt) return false;
  const started = Date.parse(flow.disbursingAt);
  return Number.isFinite(started) && Date.now() - started < DISBURSE_LOCK_MS;
}

/**
 * Record one settled payment on a flow (mutates `f`). Must be called inside the
 * store's row-locked update so concurrent captures are applied one at a time.
 *
 *  - Idempotent: a capture id already on the flow is ignored (`duplicate`).
 *  - Exactly one caller — the contribution that first tips the flow over its
 *    goal — gets `shouldDisburse`, and the flow moves to a holding state with
 *    the payout lock set, so everyone else sees it as already being handled.
 */
export function recordContribution(
  f: Flow,
  c: { id: string; amount: number; payer?: string },
  now: Date = new Date(),
): { duplicate: boolean; shouldDisburse: boolean } {
  f.contributions ??= [];
  if (f.contributions.some((x) => x.id === c.id)) {
    return { duplicate: true, shouldDisburse: false };
  }
  f.contributions.push({ id: c.id, amount: c.amount, at: now.toISOString(), payer: c.payer });
  f.collected = Number((f.collected + c.amount).toFixed(2));
  f.contributors += 1;

  let shouldDisburse = false;
  if (f.status === "Collecting" && f.collected >= f.goal && !isDisbursing(f)) {
    f.status = "Needs approval"; // safe holding state
    // A stated release condition ("once tasks are verified") means a human has
    // to confirm it, so don't pay automatically — leave it for the owner to
    // approve. Otherwise this caller claims the single automatic payout run.
    if (!hasPendingCondition(f)) {
      f.disbursingAt = now.toISOString();
      shouldDisburse = true;
    }
  }
  return { duplicate: false, shouldDisburse };
}

/** True while any not-yet-paid payout carries a release condition. */
export function hasPendingCondition(f: Pick<Flow, "payouts">): boolean {
  return f.payouts.some((p) => p.state !== "paid" && Boolean(p.condition));
}

/** The moment a flow's deadline passes: the end of that calendar day, UTC. */
export function deadlineEnd(deadline: string | undefined): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const t = Date.parse(`${deadline}T23:59:59.999Z`);
  return Number.isFinite(t) ? t : null;
}

/** True once the flow's deadline day has fully passed. */
export function isPastDeadline(flow: { deadline?: string }, now: number = Date.now()): boolean {
  const end = deadlineEnd(flow.deadline);
  return end !== null && now > end;
}

/** Whole days left until the deadline day ends (0 = ends today), or null with no deadline. */
export function daysLeft(flow: { deadline?: string }, now: number = Date.now()): number | null {
  const end = deadlineEnd(flow.deadline);
  if (end === null) return null;
  return Math.max(0, Math.ceil((end - now) / 86_400_000) - 1);
}

/**
 * One person's share of a group flow, in USD (rounded up to the cent so a group
 * of equal shares always covers the goal). Null when the flow has no group size.
 */
export function shareFor(flow: { goal: number; participants?: number }): number | null {
  const n = flow.participants;
  if (!n || n < 2 || !Number.isInteger(n)) return null;
  return Math.ceil((flow.goal * 100) / n) / 100;
}

/** Contributions that are still holding the contributor's money (not yet refunded). */
export function refundable(flow: Pick<Flow, "contributions">) {
  return (flow.contributions ?? []).filter((c) => !c.refundedAt);
}

/**
 * Whether the owner (or the deadline job) may return contributors' money. Not
 * once the flow has paid out, and not while a payout run is in flight.
 */
export function canRefund(flow: Flow): { ok: true } | { ok: false; error: string } {
  if (flow.status === "Paid out") return { ok: false, error: "This flow has already paid out." };
  if (isDisbursing(flow)) return { ok: false, error: "A payout is in progress — try again in a minute." };
  if (flow.payouts.some((p) => p.state === "paid")) {
    return { ok: false, error: "Some payouts were already sent, so the money can't be returned in full." };
  }
  if (refundable(flow).length === 0) return { ok: false, error: "There is nothing to refund." };
  return { ok: true };
}

const toCents = (n: number) => Math.round(n * 100);

/** How much is still needed to reach the goal, in USD, never negative. */
export function remainingFor(flow: { goal: number; collected: number }): number {
  return Math.max(0, (toCents(flow.goal) - toCents(flow.collected)) / 100);
}

/**
 * Validate a requested contribution against a flow. Returns the amount rounded
 * to cents, or an error message the caller can show to the contributor.
 */
export function validateContribution(
  flow: { goal: number; collected: number; status: string; deadline?: string },
  requested: number,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (flow.status !== "Collecting") {
    return { ok: false, error: "This flow is no longer collecting contributions." };
  }
  if (isPastDeadline(flow)) {
    return { ok: false, error: "The deadline for this flow has passed." };
  }
  const remaining = remainingFor(flow);
  if (remaining <= 0) {
    return { ok: false, error: "This flow is already fully funded." };
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, error: "Enter an amount to contribute." };
  }
  const amount = toCents(requested) / 100;
  // Allow a final contribution below the minimum if it's exactly what's left.
  if (amount < MIN_CONTRIBUTION && amount !== remaining) {
    return { ok: false, error: `The minimum contribution is $${MIN_CONTRIBUTION.toFixed(2)}.` };
  }
  if (amount > remaining) {
    return { ok: false, error: `Only $${remaining.toFixed(2)} is still needed — enter that or less.` };
  }
  return { ok: true, amount };
}
