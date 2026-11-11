import { DEMO_USER_ID, getUserId } from "@/lib/session";
import { isUsdTransaction, listTransactions } from "@/lib/paypal";
import { getAllFlows } from "@/lib/store";
import { currencyOf } from "@/lib/contribution";
import type { Payment } from "@/data/dashboard";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/**
 * GET /api/payments
 *
 * Merges two sources into a unified Payment[] list:
 *  1. PayPal transaction history (last 30 days) — real money-in/out events
 *  2. Flow store — recorded contributions (money-in) and approved payouts (money-out)
 *
 * Contributions recorded by the app carry PayPal's capture id, which is also the
 * PayPal transaction id — so a payment that appears in both sources is shown
 * once (the flow-store row wins, since it knows the flow name and payer).
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payments: Payment[] = [];
  // The ledger totals amounts, so it lists US-dollar activity; flows in other
  // currencies are shown on their own flow, not mixed in here.
  const allFlows = await getAllFlows(userId);
  const flows = allFlows.filter((f) => currencyOf(f) === "USD");

  // Capture ids we already represent from the flow store (any currency, so a
  // PayPal transaction for a non-USD flow is never shown as a stray row).
  const knownCaptureIds = new Set<string>();
  for (const flow of allFlows) {
    for (const c of flow.contributions ?? []) knownCaptureIds.add(c.id);
  }

  // ── Source 1: PayPal transaction history ────────────────────────────
  const details = userId === DEMO_USER_ID ? null : await listTransactions();
  if (details && details.length > 0) {
    for (const t of details.filter(isUsdTransaction)) {
      const info = t.transaction_info ?? {};
      const amt = Math.abs(Number(info.transaction_amount?.value ?? 0));
      if (!amt) continue;
      // Already shown as a recorded contribution — skip the duplicate.
      if (info.transaction_id && knownCaptureIds.has(info.transaction_id)) continue;

      const rawAmt = Number(info.transaction_amount?.value ?? 0);
      const direction: Payment["direction"] = rawAmt >= 0 ? "in" : "out";
      const who = (t.payer_info?.email_address ?? "PayPal").split("@")[0];
      const subject = info.transaction_subject || info.transaction_note || "PayPal transaction";
      const isoDate = info.transaction_initiation_date ?? new Date().toISOString();

      payments.push({
        id: info.transaction_id ? `pp-${info.transaction_id}` : `pp-${isoDate}-${amt}`,
        flow: subject,
        who,
        direction,
        amount: amt,
        date: fmtDate(new Date(isoDate)),
        method: "PayPal",
        status: "completed",
      });
    }
  }

  // ── Source 2: Flow store ─────────────────────────────────────────────
  for (const flow of flows) {
    const contributions = flow.contributions ?? [];

    if (contributions.length > 0) {
      // Real, individually-recorded payments.
      for (const c of contributions) {
        payments.push({
          id: `flow-in-${flow.id}-${c.id}`,
          flow: flow.name,
          who: c.payer ?? "Unknown payer",
          direction: "in",
          amount: c.amount,
          date: fmtDate(new Date(c.at)),
          method: "PayPal",
          status: "completed",
        });
      }
    }
    // A flow with money collected but no itemized contributions (recorded before
    // contributions were tracked) shows no incoming rows. Inventing "Contributor
    // 1, 2, 3…" with an even split and today's date would be made-up data.

    // Payouts that have actually been sent.
    for (const payout of flow.payouts) {
      if (payout.state !== "paid" || !payout.amount) continue;
      payments.push({
        id: `flow-out-${flow.id}-${payout.id ?? payout.label}`,
        flow: flow.name,
        who: payout.recipient ?? payout.label,
        direction: "out",
        amount: payout.amount,
        // The real time it was sent; "—" for payouts paid before this was recorded
        // (showing today's date would be wrong).
        date: payout.paidAt ? fmtDate(new Date(payout.paidAt)) : "—",
        method: "PayPal Payout",
        status: "completed",
      });
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = payments.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Sort newest first
  deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mode = details && details.length > 0 ? "paypal" : flows.length > 0 ? "flows" : "empty";
  return Response.json({ payments: deduped, mode });
}
