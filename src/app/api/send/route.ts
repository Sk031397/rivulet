import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/session";
import { createPayout } from "@/lib/paypal";
import { sendPaymentReceivedEmail } from "@/lib/email";


export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { recipient?: unknown; amount?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const recipient = (body.recipient ?? "").toString().trim();
  const amount = Number(body.amount);
  const note = (body.note ?? "").toString().trim();

  if (!recipient) return Response.json({ error: "recipient is required" }, { status: 400 });
  if (!amount || amount <= 0) return Response.json({ error: "a positive amount is required" }, { status: 400 });

  const recipientType = recipient.includes("@") ? ("EMAIL" as const) : ("PHONE" as const);

  // Sandbox cannot pay out to a phone number — fail fast with a clear message.
  if (recipientType === "PHONE" && process.env.PAYPAL_ENVIRONMENT !== "PRODUCTION") {
    return Response.json(
      {
        error:
          "Phone-number payouts aren't supported in the PayPal sandbox. To test, use a sandbox account's email address — phone numbers work in production.",
      },
      { status: 400 },
    );
  }

  const payout = await createPayout({ recipient, recipientType, amount, note });
  if (!payout.ok) {
    return Response.json({ error: payout.error ?? "payout failed", paypalStatus: payout.status }, { status: 502 });
  }

  // Branded receipt email for email recipients (fire-and-forget; never blocks the payout).
  if (recipientType === "EMAIL") {
    await sendPaymentReceivedEmail({ to: recipient, amount, note });
  }

  return Response.json({
    result: {
      recipient,
      recipientType,
      amount,
      batchId: payout.batchId,
      itemStatus: payout.itemStatus,
    },
  });
}
