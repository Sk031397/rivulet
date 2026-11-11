/**
 * Return contributors' money for a flow that will not go ahead.
 *
 * Used by the owner's "Refund everyone" action and by the deadline job. It
 * shares the payout lock with the payout run, so a refund and a payout can
 * never happen on the same flow at once.
 */

import type { Flow } from "@/data/dashboard";
import { canRefund, refundable } from "./contribution";
import { refundCapture } from "./paypal";
import { updateFlowUnscoped } from "./store";

export interface RefundOutcome {
  ok: boolean;
  error?: string;
  /** Number of payments returned in this call. */
  refunded: number;
  /** Number that PayPal refused (they stay refundable; retry later). */
  failed: number;
  amount: number;
  flow?: Flow;
}

export async function refundFlow(flowId: string): Promise<RefundOutcome> {
  // 1. Claim the flow: validate, take the lock, and note which captures to return.
  let rejection: string | null = null;
  let targets: Array<{ id: string; amount: number }> = [];
  const claimed = await updateFlowUnscoped(flowId, (f) => {
    const check = canRefund(f);
    if (!check.ok) {
      rejection = check.error;
      return;
    }
    targets = refundable(f).map((c) => ({ id: c.id, amount: c.amount }));
    f.disbursingAt = new Date().toISOString();
  });
  if (!claimed) return { ok: false, error: "Flow not found.", refunded: 0, failed: 0, amount: 0 };
  if (rejection) return { ok: false, error: rejection, refunded: 0, failed: 0, amount: 0, flow: claimed };

  // 2. Return each payment. Refund ids are idempotent in PayPal, so retries are safe.
  const done = new Map<string, string | undefined>();
  let failed = 0;
  for (const t of targets) {
    const r = await refundCapture(t.id);
    if (r.ok) done.set(t.id, r.refundId);
    else failed += 1;
  }

  // 3. Record what was returned and release the lock.
  const at = new Date().toISOString();
  const final = await updateFlowUnscoped(flowId, (f) => {
    for (const c of f.contributions ?? []) {
      if (done.has(c.id)) {
        c.refundedAt = at;
        c.refundId = done.get(c.id);
      }
    }
    f.collected = Number(
      (f.contributions ?? []).filter((c) => !c.refundedAt).reduce((s, c) => s + c.amount, 0).toFixed(2),
    );
    if (refundable(f).length === 0) f.status = "Refunded";
    f.disbursingAt = undefined;
  });

  const amount = targets.filter((t) => done.has(t.id)).reduce((s, t) => s + t.amount, 0);
  return {
    ok: failed === 0,
    error: failed ? `${failed} refund${failed === 1 ? "" : "s"} could not be completed — try again.` : undefined,
    refunded: done.size,
    failed,
    amount: Number(amount.toFixed(2)),
    flow: final ?? claimed,
  };
}
