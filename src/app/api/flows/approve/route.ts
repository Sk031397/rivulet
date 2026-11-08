import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { disburseFlowPayouts } from "@/lib/paypal";
import { getAllFlows, updateFlow } from "@/lib/store";

/**
 * POST /api/flows/approve
 * Body: { flowId }
 * Disburses real PayPal payouts to every eligible payout recipient, then
 * updates each payout's state based on whether its disbursement succeeded.
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

  const existing = (await getAllFlows(userId)).find((f) => f.id === flowId);
  if (!existing) return Response.json({ error: "flow not found" }, { status: 404 });

  const { results, finalStatus } = await disburseFlowPayouts(existing);

  // Build a lookup of which payout labels were successfully disbursed.
  const paidLabels = new Set(results.filter((r) => r.ok).map((r) => r.label));

  const flow = await updateFlow(flowId, userId, (f) => {
    f.status = finalStatus;
    // Only flip a payout to "paid" if its disbursement actually succeeded.
    f.payouts = f.payouts.map((p) =>
      paidLabels.has(p.label) ? { ...p, state: "paid" as const } : p,
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
