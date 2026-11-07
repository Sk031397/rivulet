import type { NextRequest } from "next/server";
import { disburseFlowPayouts } from "@/lib/paypal";
import { getAllFlows, updateFlow } from "@/lib/store";

/**
 * POST /api/flows/approve
 * Body: { flowId }
 * Disburses real PayPal payouts to every payout recipient that has an email,
 * then marks the flow as "Paid out" with each payout state set to "paid".
 */
export async function POST(req: NextRequest) {
  let body: { flowId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const flowId = (body.flowId ?? "").toString().trim();
  if (!flowId) return Response.json({ error: "flowId is required" }, { status: 400 });

  const existing = getAllFlows().find((f) => f.id === flowId);
  if (!existing) return Response.json({ error: "flow not found" }, { status: 404 });

  const { results, finalStatus } = await disburseFlowPayouts(existing);

  const flow = updateFlow(flowId, (f) => {
    f.status = finalStatus;
    if (finalStatus === "Paid out") {
      f.payouts = f.payouts.map((p) => ({ ...p, state: "paid" as const }));
    }
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
