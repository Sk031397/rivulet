import type { NextRequest } from "next/server";
import { updateFlow } from "@/lib/store";
import { createPayout } from "@/lib/paypal";

interface PayoutResult {
  label: string;
  recipient: string;
  amount: number;
  ok: boolean;
  batchId?: string;
  itemStatus?: string;
  error?: string;
}

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

  // Read the flow first so we can fire payouts before mutating state.
  const { getAllFlows } = await import("@/lib/store");
  const existing = getAllFlows().find((f) => f.id === flowId);
  if (!existing) return Response.json({ error: "flow not found" }, { status: 404 });

  // Fire a real PayPal payout for every payout that has a recipient email.
  const payoutResults: PayoutResult[] = [];

  for (const p of existing.payouts) {
    if (!p.recipient || !p.recipient.includes("@") || p.state === "paid") continue;

    const result = await createPayout({
      recipient: p.recipient,
      recipientType: "EMAIL",
      amount: p.amount,
      note: `${existing.name} — ${p.label}`,
    });

    payoutResults.push({
      label: p.label,
      recipient: p.recipient,
      amount: p.amount,
      ok: result.ok,
      batchId: result.batchId,
      itemStatus: result.itemStatus,
      error: result.error,
    });
  }

  // Update flow state: mark as Paid out, flip each payout to "paid".
  const flow = updateFlow(flowId, (f) => {
    f.status = "Paid out";
    f.payouts = f.payouts.map((p) => ({ ...p, state: "paid" as const }));
  });

  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  const disbursed = payoutResults.filter((r) => r.ok);
  const failed = payoutResults.filter((r) => !r.ok);

  return Response.json({
    flow,
    payouts: {
      attempted: payoutResults.length,
      disbursed: disbursed.length,
      failed: failed.length,
      results: payoutResults,
    },
  });
}
