/**
 * What a verified PayPal webhook event does to a flow. Pure functions (no
 * database, no network) so the rules can be unit-tested; the route in
 * src/app/api/webhooks/paypal/route.ts verifies the signature and persists.
 */

import type { Flow } from "@/data/dashboard";
import { recomputeTotals, refundable } from "./contribution.ts";

export interface Link {
  rel?: string;
  href?: string;
}

export interface WebhookEvent {
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
export const PAYOUT_PROBLEMS: Record<string, string> = {
  "PAYMENT.PAYOUTS-ITEM.FAILED": "PayPal could not send this payout.",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": "PayPal blocked this payout.",
  "PAYMENT.PAYOUTS-ITEM.DENIED": "PayPal denied this payout.",
  "PAYMENT.PAYOUTS-ITEM.RETURNED": "The recipient's payment was returned.",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": "This payout was refunded to you.",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "The recipient hasn't claimed this payout (no PayPal account for that email yet).",
  "PAYMENT.PAYOUTS-ITEM.CANCELED": "This payout was cancelled.",
  "PAYMENT.PAYOUTS-ITEM.HELD": "PayPal is holding this payout for review.",
};

export const PAYOUT_SUCCEEDED = "PAYMENT.PAYOUTS-ITEM.SUCCEEDED";

/** Payout ids look like "<flowId>-p0"; the flow id is everything before the suffix. */
export function flowIdFromPayoutId(payoutId: string): string | null {
  const m = /^(.+)-p\d+$/.exec(payoutId);
  return m ? m[1] : null;
}

/** Apply a payout event to the flow. Returns true if a matching payout was found. */
export function applyPayoutEvent(flow: Flow, event: WebhookEvent, now: string = new Date().toISOString()): boolean {
  const type = event.event_type ?? "";
  const isSuccess = type === PAYOUT_SUCCEEDED;
  const problem = PAYOUT_PROBLEMS[type];
  const payoutId = event.resource?.payout_item?.sender_item_id ?? "";

  const payout = flow.payouts.find((p) => p.id === payoutId);
  if (!payout) return false;
  payout.itemStatus = event.resource?.transaction_status ?? payout.itemStatus;

  if (isSuccess) {
    payout.state = "paid";
    payout.paidAt ??= now;
    payout.issue = undefined;
    if (flow.payouts.every((p) => p.state === "paid")) flow.status = "Paid out";
  } else {
    // The money did not land: put it back so the owner can fix the recipient and retry.
    payout.state = "pending";
    payout.paidAt = undefined;
    payout.issue = problem;
    if (flow.status === "Paid out") flow.status = "Needs approval";
  }
  return true;
}

/* ─── payments coming in ─────────────────────────────────────────────── */

/** The capture id in a refund's "up" link: .../v2/payments/captures/<id>. */
export function captureIdFromLinks(links: Link[] | undefined): string | null {
  const up = links?.find((l) => l.rel === "up")?.href ?? "";
  const m = /\/captures\/([^/?#]+)/.exec(up);
  return m ? m[1] : null;
}

/** Every capture id this event might be talking about, most specific first. */
export function candidateCaptureIds(event: WebhookEvent): string[] {
  const r = event.resource;
  const ids = [
    captureIdFromLinks(r?.links),
    ...(r?.disputed_transactions ?? []).map((t) => t.seller_transaction_id ?? null),
    r?.id ?? null,
  ];
  return ids.filter((x): x is string => Boolean(x));
}

/** Apply a refund / reversal / denial / dispute event for `captureId` to the flow. */
export function applyPaymentEvent(
  flow: Flow,
  captureId: string,
  event: WebhookEvent,
  at: string = new Date().toISOString(),
): void {
  const type = event.event_type ?? "";
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
}
