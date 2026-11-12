/**
 * Tests for what verified PayPal webhook events do to a flow
 * (src/lib/webhookRules.ts): payout outcomes, refunds, reversals, disputes.
 * Run with: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPaymentEvent,
  applyPayoutEvent,
  candidateCaptureIds,
  captureIdFromLinks,
  flowIdFromPayoutId,
  type WebhookEvent,
} from "../src/lib/webhookRules.ts";
import { recordContribution } from "../src/lib/contribution.ts";
import type { Flow } from "../src/data/dashboard.ts";

const flow = (over: Partial<Flow> = {}): Flow => ({
  id: "trip-abcd",
  name: "Trip",
  status: "Collecting",
  collected: 0,
  goal: 100,
  contributors: 0,
  contributions: [],
  payouts: [{ id: "trip-abcd-p0", label: "Villa", amount: 100, state: "pending", note: "" }],
  ...over,
});

const payoutEvent = (event_type: string, id = "trip-abcd-p0"): WebhookEvent => ({
  event_type,
  resource: { transaction_status: event_type.split(".").pop(), payout_item: { sender_item_id: id } },
});

const paymentEvent = (event_type: string, captureId: string): WebhookEvent => ({
  event_type,
  resource: { id: "REFUND1", links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }] },
});

/** A funded flow waiting for approval, built through the real money rules. */
const funded = () => {
  const f = flow();
  recordContribution(f, { id: "CAP1", amount: 60 });
  recordContribution(f, { id: "CAP2", amount: 40 });
  // The payout run (if any) has finished; the handler never rewinds a flow mid-payout.
  f.disbursingAt = undefined;
  return f;
};

test("a flow is not rewound to Collecting while a payout run is still in flight", () => {
  const f = funded();
  f.disbursingAt = new Date().toISOString();
  applyPaymentEvent(f, "CAP2", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP2"));
  assert.equal(f.status, "Needs approval");
});

/* ─── ids ────────────────────────────────────────────────────────────── */

test("a payout id maps back to its flow, and anything else is ignored", () => {
  assert.equal(flowIdFromPayoutId("trip-abcd-p0"), "trip-abcd");
  assert.equal(flowIdFromPayoutId("lisbon-trip-x1y2-p12"), "lisbon-trip-x1y2");
  assert.equal(flowIdFromPayoutId("someone-elses-payout"), null);
  assert.equal(flowIdFromPayoutId(""), null);
});

test("the capture id is found from a refund's link, a dispute, or the resource id", () => {
  assert.equal(captureIdFromLinks([{ rel: "up", href: "https://x/v2/payments/captures/CAP9?a=1" }]), "CAP9");
  assert.equal(captureIdFromLinks(undefined), null);
  assert.deepEqual(
    candidateCaptureIds({
      resource: {
        id: "R1",
        links: [{ rel: "up", href: "https://x/v2/payments/captures/CAP1" }],
        disputed_transactions: [{ seller_transaction_id: "CAP2" }],
      },
    }),
    ["CAP1", "CAP2", "R1"],
  );
});

/* ─── payouts ────────────────────────────────────────────────────────── */

test("a succeeded payout marks it paid and, when all are paid, the flow paid out", () => {
  const f = funded();
  assert.equal(applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"), "2026-11-11T10:00:00Z"), true);
  assert.equal(f.payouts[0].state, "paid");
  assert.equal(f.payouts[0].paidAt, "2026-11-11T10:00:00Z");
  assert.equal(f.status, "Paid out");
});

test("a succeeded payout keeps the original paid time on a redelivery", () => {
  const f = funded();
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"), "2026-11-11T10:00:00Z");
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"), "2026-11-12T10:00:00Z");
  assert.equal(f.payouts[0].paidAt, "2026-11-11T10:00:00Z");
});

test("one paid payout does not mark a flow with others still pending as paid out", () => {
  const f = funded();
  f.payouts.push({ id: "trip-abcd-p1", label: "Flights", amount: 50, state: "pending", note: "" });
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));
  assert.equal(f.payouts[0].state, "paid");
  assert.notEqual(f.status, "Paid out");
});

for (const type of [
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED",
]) {
  test(`${type} puts the payout back so it can be fixed and retried`, () => {
    const f = funded();
    applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));
    assert.equal(f.status, "Paid out");
    applyPayoutEvent(f, payoutEvent(type));
    assert.equal(f.payouts[0].state, "pending");
    assert.equal(f.payouts[0].paidAt, undefined);
    assert.ok(f.payouts[0].issue, "the organizer is told what went wrong");
    assert.equal(f.status, "Needs approval");
  });
}

test("a later success clears a payout's earlier problem", () => {
  const f = funded();
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.FAILED"));
  assert.ok(f.payouts[0].issue);
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));
  assert.equal(f.payouts[0].issue, undefined);
});

test("a payout event for an unknown payout changes nothing", () => {
  const f = funded();
  const before = JSON.stringify(f);
  assert.equal(applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "trip-abcd-p9")), false);
  assert.equal(JSON.stringify(f), before);
});

/* ─── payments coming in ─────────────────────────────────────────────── */

test("a payment refunded from the PayPal dashboard is mirrored and stops counting", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP2", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP2"), "2026-11-11T10:00:00Z");
  const c = f.contributions!.find((x) => x.id === "CAP2")!;
  assert.equal(c.refundedAt, "2026-11-11T10:00:00Z");
  assert.equal(c.refundId, "REFUND1");
  assert.equal(f.collected, 60);
  assert.equal(f.status, "Collecting", "the pot is short again, so it goes back to collecting instead of paying out");
});

test("a refund redelivered by PayPal does not change the recorded time", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP2", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP2"), "2026-11-11T10:00:00Z");
  applyPaymentEvent(f, "CAP2", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP2"), "2026-11-12T10:00:00Z");
  assert.equal(f.contributions!.find((x) => x.id === "CAP2")!.refundedAt, "2026-11-11T10:00:00Z");
});

test("a reversed payment is flagged, stops counting, and the pot never silently shrinks", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP1", paymentEvent("PAYMENT.CAPTURE.REVERSED", "CAP1"));
  const c = f.contributions!.find((x) => x.id === "CAP1")!;
  assert.ok(c.reversedAt);
  assert.match(c.issue ?? "", /reversed/i);
  assert.equal(f.collected, 40);
  assert.equal(f.status, "Collecting");
});

test("a denied payment is flagged as denied", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP1", paymentEvent("PAYMENT.CAPTURE.DENIED", "CAP1"));
  assert.match(f.contributions!.find((x) => x.id === "CAP1")!.issue ?? "", /denied/i);
});

test("a dispute is flagged but the money still counts until PayPal reverses it", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP1", paymentEvent("CUSTOMER.DISPUTE.CREATED", "CAP1"));
  const c = f.contributions!.find((x) => x.id === "CAP1")!;
  assert.match(c.issue ?? "", /dispute/i);
  assert.equal(c.reversedAt, undefined);
  assert.equal(f.collected, 100);
});

test("a resolved dispute clears the flag, unless the payment was reversed", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP1", paymentEvent("CUSTOMER.DISPUTE.CREATED", "CAP1"));
  applyPaymentEvent(f, "CAP1", paymentEvent("CUSTOMER.DISPUTE.RESOLVED", "CAP1"));
  assert.equal(f.contributions!.find((x) => x.id === "CAP1")!.issue, undefined);

  const g = funded();
  applyPaymentEvent(g, "CAP1", paymentEvent("PAYMENT.CAPTURE.REVERSED", "CAP1"));
  applyPaymentEvent(g, "CAP1", paymentEvent("CUSTOMER.DISPUTE.RESOLVED", "CAP1"));
  assert.ok(g.contributions!.find((x) => x.id === "CAP1")!.issue, "a reversal's note is kept");
});

test("when every payment is refunded and nothing was paid out, the flow becomes Refunded", () => {
  const f = funded();
  applyPaymentEvent(f, "CAP1", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP1"));
  applyPaymentEvent(f, "CAP2", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "CAP2"));
  assert.equal(f.collected, 0);
  assert.equal(f.status, "Refunded");
});

test("a flow that has already paid out keeps its status when a payment is later reversed", () => {
  const f = funded();
  applyPayoutEvent(f, payoutEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));
  applyPaymentEvent(f, "CAP1", paymentEvent("PAYMENT.CAPTURE.REVERSED", "CAP1"));
  assert.equal(f.status, "Paid out");
  assert.ok(f.contributions!.find((x) => x.id === "CAP1")!.issue, "the owner is still told");
});

test("a payment event for an unknown capture changes nothing", () => {
  const f = funded();
  const before = JSON.stringify(f);
  applyPaymentEvent(f, "NOPE", paymentEvent("PAYMENT.CAPTURE.REFUNDED", "NOPE"));
  assert.equal(JSON.stringify(f), before);
});
