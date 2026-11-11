import type { NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { findFlowIdByCapture, updateFlowUnscoped } from "@/lib/store";
import { recomputeTotals, refundable } from "@/lib/contribution";

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

interface Link {
  rel?: string;
  href?: string;
}

interface WebhookEvent {
  event_type?: string;
  resource?: {
    id?: string;
    dispute_id?: string;
    transaction_status?: string;
    payout_item?: { sender_item_id?: string };
    links?: Link[];
    disputed_transactions?: Array<{ seller_transaction_id?: string }>;
  };
}

/* ─── payouts ────────────────────────────────────────────────────────── */

/** Payout events that mean the money did NOT reach the recipient. */
const PAYOUT_PROBLEMS: Record<string, string> = {
  "PAYMENT.PAYOUTS-ITEM.FAILED": "PayPal could not send this payout.",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": "PayPal blocked this payout.",
  "PAYMENT.PAYOUTS-ITEM.DENIED": "PayPal denied this payout.",
  "PAYMENT.PAYOUTS-ITEM.RETURNED": "The recipient's payment was returned.",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": "This payout was refunded to you.",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "The recipient hasn't claimed this payout (no PayPal account for that email yet).",
  "PAYMENT.PAYOUTS-ITEM.CANCELED": "This payout was cancelled.",
  "PAYMENT.PAYOUTS-ITEM.HELD": "PayPal is holding this payout for review.",
};

const PAYOUT_SUCCEEDED = "PAYMENT.PAYOUTS-ITEM.SUCCEEDED";

/** Payout ids look like "<flowId>-p0"; the flow id is everything before the suffix. */
function flowIdFromPayoutId(payoutId: string): string | null {
  const m = /^(.+)-p\d+$/.exec(payoutId);
  return m ? m[1] : null;
}

async function handlePayout(event: WebhookEvent) {
  const type = event.event_type ?? "";
  const isSuccess = type === PAYOUT_SUCCEEDED;
  const problem = PAYOUT_PROBLEMS[type];

  const payoutId = event.resource?.payout_item?.sender_item_id ?? "";
  const flowId = flowIdFromPayoutId(payoutId);
  if (!flowId) return { ok: true, ignored: "not a Rivulet payout" };

  const itemStatus = event.resource?.transaction_status;
  let found = false;
  await updateFlowUnscoped(flowId, (flow) => {
    const payout = flow.payouts.find((p) => p.id === payoutId);
    if (!payout) return;
    found = true;
    payout.itemStatus = itemStatus ?? payout.itemStatus;

    if (isSuccess) {
      payout.state = "paid";
      payout.paidAt ??= new Date().toISOString();
      payout.issue = undefined;
      if (flow.payouts.every((p) => p.state === "paid")) flow.status = "Paid out";
    } else {
      // The money did not land: put it back so the owner can fix the recipient and retry.
      payout.state = "pending";
      payout.paidAt = undefined;
      payout.issue = problem;
      if (flow.status === "Paid out") flow.status = "Needs approval";
    }
  });
  return { ok: true, updated: found };
}

/* ─── payments coming in ─────────────────────────────────────────────── */

/** The capture id in a refund's "up" link: .../v2/payments/captures/<id>. */
function captureIdFromLinks(links: Link[] | undefined): string | null {
  const up = links?.find((l) => l.rel === "up")?.href ?? "";
  const m = /\/captures\/([^/?#]+)/.exec(up);
  return m ? m[1] : null;
}

/** Every capture id this event might be talking about, most specific first. */
function candidateCaptureIds(event: WebhookEvent): string[] {
  const r = event.resource;
  const ids = [
    captureIdFromLinks(r?.links),
    ...(r?.disputed_transactions ?? []).map((t) => t.seller_transaction_id ?? null),
    r?.id ?? null,
  ];
  return ids.filter((x): x is string => Boolean(x));
}

async function handlePayment(event: WebhookEvent) {
  const type = event.event_type ?? "";

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

  const at = new Date().toISOString();
  await updateFlowUnscoped(flowId, (flow) => {
    const c = flow.contributions?.find((x) => x.id === captureId);
    if (!c) return;

    if (type === "PAYMENT.CAPTURE.REFUNDED") {
      // Refunded outside Rivulet (e.g. from the PayPal dashboard). Mirror it.
      if (!c.refundedAt) {
        c.refundedAt = at;
        c.refundId ??= event.resource?.id;
      }
    } else if (type === "PAYMENT.CAPTURE.REVERSED" || type === "PAYMENT.CAPTURE.DENIED") {
      if (!c.reversedAt) c.reversedAt = at;
      c.issue = type === "PAYMENT.CAPTURE.DENIED" ? "PayPal denied this payment after it was captured." : "PayPal reversed this payment.";
    } else if (type === "CUSTOMER.DISPUTE.CREATED") {
      c.issue = "The payer opened a dispute with PayPal.";
    } else if (type === "CUSTOMER.DISPUTE.RESOLVED") {
      // A resolved dispute that cost us the money arrives separately as a reversal.
      if (!c.reversedAt) c.issue = undefined;
    }

    recomputeTotals(flow);

    // Money has left the pot. If nothing has been paid out yet, go back to
    // collecting (or refunded, if there's nothing left at all) rather than
    // paying out money that is no longer there.
    if (flow.status !== "Paid out" && !flow.payouts.some((p) => p.state === "paid")) {
      if (refundable(flow).length === 0 && (flow.contributions?.length ?? 0) > 0) {
        flow.status = "Refunded";
      } else if (flow.collected < flow.goal && flow.status === "Needs approval" && !flow.disbursingAt) {
        flow.status = "Collecting";
      }
    }
  });
  return { ok: true, handled: type };
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
