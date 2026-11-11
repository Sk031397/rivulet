/**
 * Send the payouts that are due on a flow and record the outcome.
 *
 * Used when a contribution completes the goal (/api/capture) and by the daily
 * job that releases payouts whose release date has arrived. The caller must
 * already hold the payout lock (flow.disbursingAt); this clears it when done.
 */

import type { Flow } from "@/data/dashboard";
import { isDisbursing, payoutDue } from "./contribution";
import { disburseFlowPayouts, type PayoutResult } from "./paypal";
import { updateFlowUnscoped } from "./store";

export async function disburseAndRecord(
  flowId: string,
  claimed: Flow,
): Promise<{ flow: Flow; results: PayoutResult[] }> {
  let results: PayoutResult[] = [];
  let finalStatus: "Paid out" | "Scheduled" | "Needs approval" = "Needs approval";
  try {
    const disbursed = await disburseFlowPayouts(claimed, { onlyDue: true });
    results = disbursed.results;
    finalStatus = disbursed.finalStatus;
  } catch (err) {
    // The contribution is already safely recorded; leave the flow for the owner
    // to approve manually instead of failing anyone's payment.
    console.error("[release] disburse failed:", err);
  }

  const paidLabels = new Set(results.filter((r) => r.ok).map((r) => r.label));
  const at = new Date().toISOString();
  const updated = await updateFlowUnscoped(flowId, (f) => {
    f.status = finalStatus;
    f.disbursingAt = undefined;
    f.payouts = f.payouts.map((p) =>
      paidLabels.has(p.label) ? { ...p, state: "paid" as const, paidAt: at, issue: undefined } : p,
    );
  });
  return { flow: updated ?? claimed, results };
}

/**
 * Claim a "Scheduled" flow whose release date has arrived and pay what is due.
 * Returns null if nothing was due, or someone else already holds the lock.
 */
export async function releaseDuePayouts(flowId: string): Promise<{ flow: Flow; results: PayoutResult[] } | null> {
  let claimedFlow: Flow | null = null;
  await updateFlowUnscoped(flowId, (f) => {
    if (f.status !== "Scheduled" || isDisbursing(f)) return;
    if (!f.payouts.some((p) => payoutDue(p))) return;
    f.disbursingAt = new Date().toISOString();
    claimedFlow = JSON.parse(JSON.stringify(f)) as Flow;
  });
  if (!claimedFlow) return null;
  return disburseAndRecord(flowId, claimedFlow);
}
