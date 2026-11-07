import type { NextRequest } from "next/server";
import { updateFlow } from "@/lib/store";

/**
 * POST /api/flows/approve
 * Body: { flowId }
 * Marks a flow as paid out — status "Paid out" and every payout released.
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

  const flow = updateFlow(flowId, (f) => {
    f.status = "Paid out";
    f.payouts = f.payouts.map((p) => ({ ...p, state: "paid" }));
  });

  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ flow });
}
