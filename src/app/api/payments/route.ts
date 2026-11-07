import { listTransactions } from "@/lib/paypal";
import { getAllFlows } from "@/lib/store";
import type { Payment } from "@/data/dashboard";

/**
 * GET /api/payments
 *
 * Merges two sources into a unified Payment[] list:
 *  1. PayPal transaction history (last 30 days) — real money-in events
 *  2. Flow store — contributor captures (money-in) and approved payouts (money-out)
 *
 * Falls back to flow-store-only when PayPal credentials are absent.
 */
export async function GET() {
  const payments: Payment[] = [];

  // ── Source 1: PayPal transaction history ────────────────────────────
  const details = await listTransactions();
  if (details && details.length > 0) {
    for (const t of details) {
      const info = t.transaction_info ?? {};
      const amt = Math.abs(Number(info.transaction_amount?.value ?? 0));
      if (!amt) continue;

      const rawAmt = Number(info.transaction_amount?.value ?? 0);
      const direction: Payment["direction"] = rawAmt >= 0 ? "in" : "out";
      const who = (t.payer_info?.email_address ?? "PayPal").split("@")[0];
      const subject = info.transaction_subject || info.transaction_note || "PayPal transaction";
      const isoDate = info.transaction_initiation_date ?? new Date().toISOString();
      const date = new Date(isoDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      payments.push({
        id: `pp-${isoDate}-${amt}`,
        flow: subject,
        who,
        direction,
        amount: amt,
        date,
        method: "PayPal",
        status: "completed",
      });
    }
  }

  // ── Source 2: Flow store ─────────────────────────────────────────────
  const flows = getAllFlows();

  for (const flow of flows) {
    // Every flow with collected > 0 represents contributor payments in
    if (flow.collected > 0) {
      const contributors = flow.contributors || 1;
      const perContributor = Number((flow.collected / contributors).toFixed(2));

      // Generate one row per contributor (estimated split)
      for (let i = 0; i < contributors; i++) {
        payments.push({
          id: `flow-in-${flow.id}-${i}`,
          flow: flow.name,
          who: `Contributor ${i + 1}`,
          direction: "in",
          amount: perContributor,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          method: "PayPal",
          status: flow.status === "Needs approval" || flow.status === "Collecting"
            ? "pending"
            : "completed",
        });
      }
    }

    // Paid-out flows: each payout with a recipient = an outbound payment
    if (flow.status === "Paid out") {
      for (const payout of flow.payouts) {
        if (!payout.amount) continue;
        payments.push({
          id: `flow-out-${flow.id}-${payout.label}`,
          flow: flow.name,
          who: payout.recipient ?? payout.label,
          direction: "out",
          amount: payout.amount,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          method: "PayPal Payout",
          status: "completed",
        });
      }
    }
  }

  // Deduplicate by id (PayPal source may overlap with flow source for the same tx)
  const seen = new Set<string>();
  const deduped = payments.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Sort newest first — best-effort since flow rows use today's date
  deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mode = details && details.length > 0 ? "paypal" : flows.length > 0 ? "flows" : "empty";
  return Response.json({ payments: deduped, mode });
}
