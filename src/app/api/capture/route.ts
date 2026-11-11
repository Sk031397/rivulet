import type { NextRequest } from "next/server";
import { captureOrder, getOrder, type PayoutResult } from "@/lib/paypal";
import { updateFlowUnscoped, getFlowByIdUnscoped } from "@/lib/store";
import { disburseAndRecord } from "@/lib/release";
import { toPublicFlow, maskRecipient } from "@/lib/publicFlow";
import { isPastDeadline, recordContribution, remainingFor } from "@/lib/contribution";

/**
 * POST /api/capture
 * Body: { orderId, flowId }
 *
 * Public on purpose (contributors have no session). Settles one contributor's
 * approved PayPal order and credits it to the flow.
 *
 * Safety properties:
 *  - The flow must exist BEFORE any money is captured.
 *  - The order must have been created for THIS flow (PayPal custom_id) — an
 *    order made for one flow can't be used to credit another.
 *  - Idempotent: a retried request (dropped connection, double click) records
 *    the payment once, keyed by PayPal's capture id.
 *  - When a contribution is the one that reaches the goal, exactly one request
 *    claims the payout run (see `disbursingAt`), so recipients are paid once
 *    even with many contributors paying at the same moment.
 *  - The response never contains owner ids or raw recipient addresses.
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

  // 1. The flow must exist before we touch any money.
  const flow = await getFlowByIdUnscoped(flowId);
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  // 2. Verify the order is for this flow, and find out whether it's already settled.
  const order = await getOrder(orderId);
  if (!order.ok) {
    return Response.json({ error: "Could not verify this PayPal payment." }, { status: 400 });
  }
  if (order.customId !== flowId) {
    return Response.json({ error: "This payment does not belong to this flow." }, { status: 400 });
  }

  let captureId: string | undefined;
  const memberId = order.referenceId;
  let amount = 0;
  let captureStatus: string | undefined;
  let payer: string | undefined;

  if (order.status === "COMPLETED") {
    // Already captured (a retry). Use what PayPal recorded; record it if we haven't yet.
    captureId = order.captureId;
    amount = order.captureAmount ?? 0;
    captureStatus = order.captureStatus;
    payer = order.payerName ?? order.payerEmail;
  } else if (order.status === "APPROVED") {
    // Two people can both pass the check when their orders are created and then
    // both approve. Refuse to charge an order that no longer fits — it stays
    // uncaptured, so this payer is NOT charged.
    const cents = (n: number) => Math.round(n * 100);
    if (flow.status !== "Collecting" || cents(order.amount ?? 0) > cents(remainingFor(flow))) {
      return Response.json(
        { error: "This flow was filled by someone else while you were paying. You have not been charged." },
        { status: 409 },
      );
    }
    if (isPastDeadline(flow)) {
      return Response.json(
        { error: "The deadline for this flow has passed. You have not been charged." },
        { status: 409 },
      );
    }
    const capture = await captureOrder(orderId);
    if (!capture.ok) {
      return Response.json({ error: "PayPal could not complete this payment." }, { status: 502 });
    }
    captureId = capture.captureId;
    amount = capture.amount;
    captureStatus = capture.captureStatus;
    payer = capture.payerName ?? capture.payerEmail;
  } else {
    return Response.json({ error: "This payment hasn't been approved in PayPal yet." }, { status: 400 });
  }

  if (!captureId || !(amount > 0)) {
    return Response.json({ error: "PayPal returned an unexpected response for this payment." }, { status: 502 });
  }
  if (captureStatus !== "COMPLETED") {
    // e.g. PENDING (e-check, risk review). Don't credit money that hasn't settled.
    return Response.json(
      { error: "Your payment is pending with PayPal and will count once it clears." },
      { status: 409 },
    );
  }

  // 3. Record it atomically (row-locked transaction) and decide who runs payouts.
  let duplicate = false;
  let shouldDisburse = false;
  const recorded = await updateFlowUnscoped(flowId, (f) => {
    const outcome = recordContribution(f, { id: captureId!, amount, payer, memberId });
    duplicate = outcome.duplicate;
    shouldDisburse = outcome.shouldDisburse;
  });

  if (!recorded) {
    // The flow vanished between the check and the write. The payment is settled
    // in PayPal, so say so plainly rather than pretending it failed.
    return Response.json(
      { error: "Your payment went through but the flow no longer exists. Contact the organizer.", captured: amount },
      { status: 404 },
    );
  }

  // 4. If this contribution completed the goal, pay out what is due — exactly once.
  //    Payouts with a future release date wait for the daily job; ones with a
  //    manual condition wait for the owner (recordContribution never claims those).
  let results: PayoutResult[] = [];
  let finalFlow = recorded;

  if (shouldDisburse) {
    const out = await disburseAndRecord(flowId, recorded);
    results = out.results;
    finalFlow = out.flow;
  }

  return Response.json({
    flow: toPublicFlow(finalFlow),
    captured: amount,
    alreadyRecorded: duplicate,
    autoDisburse: shouldDisburse,
    ...(shouldDisburse
      ? {
          payouts: {
            attempted: results.length,
            disbursed: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
            results: results.map((r) => ({
              label: r.label,
              recipient: maskRecipient(r.recipient),
              amount: r.amount,
              ok: r.ok,
              itemStatus: r.itemStatus,
              // Raw PayPal error text can contain internals — keep it generic here.
              error: r.ok ? undefined : "This payout couldn't be sent yet; the organizer can retry it.",
            })),
          },
        }
      : {}),
  });
}
