import type { NextRequest } from "next/server";
import { captureOrder, disburseFlowPayouts, type PayoutResult } from "@/lib/paypal";
import { updateFlowUnscoped, getFlowByIdUnscoped } from "@/lib/store";

/**
 * POST /api/capture
 * Body: { orderId, flowId }
 * Captures an approved PayPal order and reconciles it into the flow.
 * If the goal is met after capture, automatically fires PayPal payouts
 * to every payout recipient — no manual approval step needed.
 */
export async function POST(req: NextRequest) {
  let body: { orderId?: unknown; flowId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").toString().trim();
  const flowId = (body.flowId ?? "").toString().trim();
  if (!orderId || !flowId) {
    return Response.json({ error: "orderId and flowId are required" }, { status: 400 });
  }

  const capture = await captureOrder(orderId);
  if (!capture.ok) {
    return Response.json(
      { error: capture.error ?? "capture failed", paypalStatus: capture.status },
      { status: 502 },
    );
  }

  // Update collected + contributors first so we can read the new total.
  // Unscoped: the caller is a contributor paying in, not the flow owner.
  let flow = await updateFlowUnscoped(flowId, (f) => {
    f.collected = Number((f.collected + capture.amount).toFixed(2));
    f.contributors += 1;
  });

  if (!flow) {
    return Response.json(
      { error: "flow not found", captured: capture.amount },
      { status: 404 },
    );
  }

  // Goal not yet reached — stay in Collecting state.
  if (flow.collected < flow.goal) {
    return Response.json({ flow, captured: capture.amount, autoDisburse: false });
  }

  // ── Goal reached — auto-disburse to all payout recipients ────────────
  const existing = await getFlowByIdUnscoped(flowId);

  let disbursed: { results: PayoutResult[]; finalStatus: "Paid out" | "Needs approval" } = {
    results: [],
    finalStatus: "Paid out",
  };

  if (existing) {
    disbursed = await disburseFlowPayouts(existing);
  }

  const paidLabels = new Set(disbursed.results.filter((r) => r.ok).map((r) => r.label));

  flow = await updateFlowUnscoped(flowId, (f) => {
    f.status = disbursed.finalStatus;
    f.payouts = f.payouts.map((p) =>
      paidLabels.has(p.label) ? { ...p, state: "paid" as const } : p,
    );
  });

  return Response.json({
    flow,
    captured: capture.amount,
    autoDisburse: true,
    payouts: {
      attempted: disbursed.results.length,
      disbursed: disbursed.results.filter((r) => r.ok).length,
      failed: disbursed.results.filter((r) => !r.ok).length,
      results: disbursed.results,
    },
  });
}
