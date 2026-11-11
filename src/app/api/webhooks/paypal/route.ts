import type { NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { updateFlowUnscoped } from "@/lib/store";

/**
 * POST /api/webhooks/paypal
 *
 * PayPal tells us what really happened to each payout after we sent it. Without
 * this, a payout that PayPal later fails, returns or leaves unclaimed would
 * still show as paid in Rivulet.
 *
 * Public by necessity (PayPal has no session), so every call is verified with
 * PayPal's verify-webhook-signature endpoint before anything is changed.
 * Handlers are idempotent — PayPal retries deliveries.
 */

interface PayoutItemEvent {
  event_type?: string;
  resource?: {
    transaction_status?: string;
    payout_item?: { sender_item_id?: string };
    errors?: { name?: string; message?: string };
  };
}

/** Payout events that mean the money did NOT reach the recipient. */
const PROBLEMS: Record<string, string> = {
  "PAYMENT.PAYOUTS-ITEM.FAILED": "PayPal could not send this payout.",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": "PayPal blocked this payout.",
  "PAYMENT.PAYOUTS-ITEM.DENIED": "PayPal denied this payout.",
  "PAYMENT.PAYOUTS-ITEM.RETURNED": "The recipient's payment was returned.",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": "This payout was refunded to you.",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "The recipient hasn't claimed this payout (no PayPal account for that email yet).",
  "PAYMENT.PAYOUTS-ITEM.CANCELED": "This payout was cancelled.",
  "PAYMENT.PAYOUTS-ITEM.HELD": "PayPal is holding this payout for review.",
};

const SUCCEEDED = "PAYMENT.PAYOUTS-ITEM.SUCCEEDED";

/** Payout ids look like "<flowId>-p0"; the flow id is everything before the suffix. */
function flowIdFromPayoutId(payoutId: string): string | null {
  const m = /^(.+)-p\d+$/.exec(payoutId);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event: PayoutItemEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // PayPal verifies against the exact event it sent, so pass the parsed body through untouched.
  const genuine = await verifyWebhookSignature(req.headers, event);
  if (!genuine) return Response.json({ error: "signature verification failed" }, { status: 401 });

  const type = event.event_type ?? "";
  const isSuccess = type === SUCCEEDED;
  const problem = PROBLEMS[type];
  if (!isSuccess && !problem) {
    // A verified event we don't act on (e.g. capture events). Acknowledge so PayPal stops retrying.
    return Response.json({ ok: true, ignored: type });
  }

  const payoutId = event.resource?.payout_item?.sender_item_id ?? "";
  const flowId = flowIdFromPayoutId(payoutId);
  if (!flowId) return Response.json({ ok: true, ignored: "not a Rivulet payout" });

  const itemStatus = event.resource?.transaction_status;
  let found = false;

  try {
    await updateFlowUnscoped(flowId, (flow) => {
      const payout = flow.payouts.find((p) => p.id === payoutId);
      if (!payout) return;
      found = true;
      payout.itemStatus = itemStatus ?? payout.itemStatus;

      if (isSuccess) {
        payout.state = "paid";
        payout.paidAt ??= new Date().toISOString();
        payout.issue = undefined;
        // If every payout is confirmed paid, the flow is done.
        if (flow.payouts.every((p) => p.state === "paid")) flow.status = "Paid out";
      } else {
        // The money did not land: put it back so the owner can fix the recipient and retry.
        payout.state = "pending";
        payout.paidAt = undefined;
        payout.issue = problem;
        if (flow.status === "Paid out") flow.status = "Needs approval";
      }
    });
  } catch (err) {
    console.error("[webhook] could not update flow:", err);
    // A 500 makes PayPal redeliver, so a transient database error isn't lost.
    return Response.json({ error: "could not record event" }, { status: 500 });
  }

  return Response.json({ ok: true, updated: found });
}
