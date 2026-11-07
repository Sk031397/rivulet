import type { NextRequest } from "next/server";
import { captureOrder } from "@/lib/paypal";
import { updateFlow } from "@/lib/store";

/**
 * POST /api/capture
 * Body: { orderId, flowId }
 * Captures an approved PayPal order and reconciles it into the flow:
 * adds the captured amount to `collected`, bumps `contributors`, and flips the
 * status to "Needs approval" once the goal is met.
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

  const flow = updateFlow(flowId, (f) => {
    f.collected = Number((f.collected + capture.amount).toFixed(2));
    f.contributors += 1;
    if (f.collected >= f.goal) f.status = "Needs approval";
  });

  if (!flow) {
    return Response.json(
      { error: "flow not found", captured: capture.amount },
      { status: 404 },
    );
  }

  return Response.json({ flow, captured: capture.amount });
}
