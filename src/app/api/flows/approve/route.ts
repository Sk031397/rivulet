import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { disburseFlowPayouts, type PayoutResult } from "@/lib/paypal";
import { updateFlow } from "@/lib/store";
import { isDisbursing } from "@/lib/contribution";

/**
 * POST /api/flows/approve
 * Body: { flowId }
 * Disburses real PayPal payouts to every eligible payout recipient, then
 * updates each payout's state based on whether its disbursement succeeded.
 *
 * Only a funded flow awaiting approval can be paid out (payouts come out of the
 * PayPal balance, so paying an unfunded flow would spend money that was never
 * collected). A short-lived lock stops two runs — a double click, a second tab,
 * or the automatic payout — from paying the same recipients twice.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { flowId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const flowId = (body.flowId ?? "").toString().trim();
  if (!flowId) return Response.json({ error: "flowId is required" }, { status: 400 });

  // Claim the payout run atomically (row-locked), so only one caller proceeds.
  let refusal: { status: number; error: string } | null = null;
  const claimed = await updateFlow(flowId, userId, (f) => {
    if (isDisbursing(f)) {
      refusal = { status: 409, error: "A payout is already in progress for this flow." };
    } else if (f.status === "Paid out") {
      refusal = { status: 409, error: "This flow has already been paid out." };
    } else if (f.status !== "Needs approval") {
      refusal = { status: 409, error: "This flow isn't fully funded yet, so it can't be paid out." };
    } else {
      f.disbursingAt = new Date().toISOString();
    }
  });
  if (!claimed) return Response.json({ error: "flow not found" }, { status: 404 });
  if (refusal) {
    const { status, error } = refusal as { status: number; error: string };
    return Response.json({ error }, { status });
  }

  let results: PayoutResult[] = [];
  let finalStatus: "Paid out" | "Needs approval" = "Needs approval";
  try {
    const disbursed = await disburseFlowPayouts(claimed);
    results = disbursed.results;
    finalStatus = disbursed.finalStatus;
  } catch (err) {
    console.error("[approve] disburse failed:", err);
  }

  // Only flip a payout to "paid" if its disbursement actually succeeded.
  const paidLabels = new Set(results.filter((r) => r.ok).map((r) => r.label));
  const flow = await updateFlow(flowId, userId, (f) => {
    f.status = finalStatus;
    f.disbursingAt = undefined;
    f.payouts = f.payouts.map((p) =>
      paidLabels.has(p.label) ? { ...p, state: "paid" as const, paidAt: new Date().toISOString(), issue: undefined } : p,
    );
  });

  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  return Response.json({
    flow,
    payouts: {
      attempted: results.length,
      disbursed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    },
  });
}
