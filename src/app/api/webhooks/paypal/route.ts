import type { NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { findFlowIdByCapture, updateFlowUnscoped } from "@/lib/store";
import {
  PAYOUT_PROBLEMS,
  PAYOUT_SUCCEEDED,
  applyPaymentEvent,
  applyPayoutEvent,
  candidateCaptureIds,
  flowIdFromPayoutId,
  type WebhookEvent,
} from "@/lib/webhookRules";

/**
 * POST /api/webhooks/paypal
 *
 * PayPal tells us what really happened after we acted. Without this, a payout
 * that PayPal later fails or returns, a payment that is refunded from the PayPal
 * dashboard, or one that is reversed or disputed, would still look fine here.
 *
 * Public by necessity (PayPal has no session), so every call is verified with
 * PayPal's verify-webhook-signature endpoint before anything is changed.
 * Handlers are idempotent — PayPal retries deliveries.
 *
 * Events to subscribe to in the PayPal dashboard:
 *   PAYMENT.PAYOUTS-ITEM.*          payout outcomes
 *   PAYMENT.CAPTURE.REFUNDED        a payment was refunded (e.g. from PayPal)
 *   PAYMENT.CAPTURE.REVERSED        a payment was taken back
 *   PAYMENT.CAPTURE.DENIED          a payment was denied after capture
 *   CUSTOMER.DISPUTE.CREATED / .RESOLVED
 */

async function handlePayout(event: WebhookEvent) {
  const flowId = flowIdFromPayoutId(event.resource?.payout_item?.sender_item_id ?? "");
  if (!flowId) return { ok: true, ignored: "not a Rivulet payout" };

  let found = false;
  await updateFlowUnscoped(flowId, (flow) => {
    found = applyPayoutEvent(flow, event);
  });
  return { ok: true, updated: found };
}

async function handlePayment(event: WebhookEvent) {
  let captureId: string | null = null;
  let flowId: string | null = null;
  for (const candidate of candidateCaptureIds(event)) {
    flowId = await findFlowIdByCapture(candidate);
    if (flowId) {
      captureId = candidate;
      break;
    }
  }
  if (!flowId || !captureId) return { ok: true, ignored: "not a payment into a Rivulet flow" };

  const id = captureId;
  await updateFlowUnscoped(flowId, (flow) => applyPaymentEvent(flow, id, event));
  return { ok: true, handled: event.event_type ?? "" };
}
/* ─── entry point ────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // PayPal verifies against the exact event it sent, so pass the parsed body through untouched.
  const genuine = await verifyWebhookSignature(req.headers, event);
  if (!genuine) return Response.json({ error: "signature verification failed" }, { status: 401 });

  const type = event.event_type ?? "";
  try {
    if (type === PAYOUT_SUCCEEDED || type in PAYOUT_PROBLEMS) {
      return Response.json(await handlePayout(event));
    }
    if (
      type === "PAYMENT.CAPTURE.REFUNDED" ||
      type === "PAYMENT.CAPTURE.REVERSED" ||
      type === "PAYMENT.CAPTURE.DENIED" ||
      type === "CUSTOMER.DISPUTE.CREATED" ||
      type === "CUSTOMER.DISPUTE.RESOLVED"
    ) {
      return Response.json(await handlePayment(event));
    }
  } catch (err) {
    console.error("[webhook] could not record event:", err);
    // A 500 makes PayPal redeliver, so a transient database error isn't lost.
    return Response.json({ error: "could not record event" }, { status: 500 });
  }

  // A verified event we don't act on. Acknowledge so PayPal stops retrying.
  return Response.json({ ok: true, ignored: type });
}
