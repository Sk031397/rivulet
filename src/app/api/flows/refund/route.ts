import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/session";
import { getAllFlows } from "@/lib/store";
import { refundFlow } from "@/lib/refund";

/**
 * POST /api/flows/refund
 * Body: { flowId }
 *
 * Owner only. Returns every contributor's payment in full via PayPal and marks
 * the flow Refunded. Refused once any payout has been sent.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { flowId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const flowId = (body.flowId ?? "").toString().trim();
  if (!flowId) return Response.json({ error: "flowId is required" }, { status: 400 });

  // Ownership check: the flow must be one of this user's.
  const mine = await getAllFlows(userId);
  if (!mine.some((f) => f.id === flowId)) {
    return Response.json({ error: "flow not found" }, { status: 404 });
  }

  const outcome = await refundFlow(flowId);
  if (!outcome.ok && outcome.refunded === 0) {
    return Response.json({ error: outcome.error ?? "Refund failed." }, { status: 409 });
  }
  return Response.json(outcome);
}
