import type { NextRequest } from "next/server";
import { createOrderForAmount, hasPayPalCreds } from "@/lib/paypal";
import { getFlowByIdUnscoped } from "@/lib/store";
import { currencyOf, validateContribution } from "@/lib/contribution";

/**
 * POST /api/orders
 * Body: { flowId, amount }
 *
 * Public on purpose: contributors paying into a flow have no session. Creates a
 * fresh PayPal order for exactly the amount the contributor chose, so many
 * people can each fund part of one flow. The order is tagged with the flow id
 * (PayPal `custom_id`) so /api/capture can verify it belongs to that flow.
 *
 * Creating an order moves no money — nothing is charged until the contributor
 * approves it in PayPal and it is captured.
 */
export async function POST(req: NextRequest) {
  let body: { flowId?: unknown; amount?: unknown; memberId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const flowId = (body.flowId ?? "").toString().trim();
  if (!flowId) return Response.json({ error: "flowId is required" }, { status: 400 });

  const flow = await getFlowByIdUnscoped(flowId);
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  const check = validateContribution(flow, Number(body.amount));
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  if (!hasPayPalCreds()) {
    return Response.json({ error: "PayPal checkout is not configured on the server." }, { status: 503 });
  }

  // Optional: which roster member this payment is for. Must be a real member —
  // the id is attached to the PayPal order server-side and read back at capture.
  const memberId = typeof body.memberId === "string" ? body.memberId : undefined;
  if (memberId && !flow.roster?.some((m) => m.id === memberId)) {
    return Response.json({ error: "That person isn't on this flow's list." }, { status: 400 });
  }

  const order = await createOrderForAmount(
    check.amount,
    `${flow.name} — contribution`,
    flow.id,
    memberId,
    currencyOf(flow),
  );
  if (!order.ok || !order.orderId) {
    return Response.json({ error: "Could not start the PayPal payment. Please try again." }, { status: 502 });
  }

  return Response.json({ orderId: order.orderId, amount: check.amount });
}
