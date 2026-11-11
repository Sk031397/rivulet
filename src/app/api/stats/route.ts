import { getUserId } from "@/lib/session";
import { listTransactions, transactionsToStats } from "@/lib/paypal";
import { getAllFlows } from "@/lib/store";
import { currencyOf } from "@/lib/contribution";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Live flow data for this user. Totals add amounts together, so they count
  // US-dollar flows only; flows in other currencies are shown on their own.
  const allFlows = await getAllFlows(userId);
  const otherCurrency = allFlows.filter((f) => currencyOf(f) !== "USD").length;
  const flows = allFlows.filter((f) => currencyOf(f) === "USD");
  const activeFlows = flows.filter((f) => f.status !== "Paid out");
  const needsApproval = flows.filter((f) => f.status === "Needs approval").length;
  const flowCollected = flows.reduce((sum, f) => sum + f.collected, 0);
  const flowPaidOut = flows
    .filter((f) => f.status === "Paid out")
    .reduce((sum, f) => sum + f.goal, 0);

  const activeNote =
    needsApproval > 0
      ? `${needsApproval} need${needsApproval === 1 ? "s" : ""} your approval`
      : activeFlows.length === 0
        ? "No active flows"
        : `${activeFlows.filter((f) => f.status === "Collecting").length} collecting`;

  // Choose ONE coherent source for the money figures so balance stays consistent:
  // prefer real PayPal activity when present, otherwise the flow store.
  const details = await listTransactions();
  const hasPayPal = Boolean(details && details.length);

  let collected: number;
  let paidOut: number;
  let collectedNote: string;
  let paidOutNote: string;
  let mode: "paypal" | "flows" | "empty";

  if (hasPayPal) {
    const pp = transactionsToStats(details!);
    collected = pp.collected;
    paidOut = pp.paidOut;
    collectedNote = `${pp.count} transaction${pp.count === 1 ? "" : "s"} via PayPal`;
    paidOutNote = paidOut > 0 ? "from real PayPal activity" : "No payouts yet";
    mode = "paypal";
  } else if (flows.length > 0) {
    collected = flowCollected;
    paidOut = flowPaidOut;
    const contributors = flows.reduce((s, f) => s + f.contributors, 0);
    collectedNote = `${contributors} contributor${contributors === 1 ? "" : "s"} across all flows`;
    const paidFlows = flows.filter((f) => f.status === "Paid out").length;
    paidOutNote = paidOut > 0 ? `${paidFlows} flow${paidFlows === 1 ? "" : "s"} completed` : "No payouts yet";
    mode = "flows";
  } else {
    return Response.json({
      stats: [
        { label: "Available balance",    value: "$0.00", note: "No transactions yet"      },
        { label: "Collected this month", value: "$0.00", note: "Create a flow to collect" },
        { label: "Paid out",             value: "$0.00", note: "No payouts yet"            },
        { label: "Active flows",         value: "0",     note: "Create your first flow"    },
      ],
      mode: "empty",
    });
  }

  const balance = Math.max(0, collected - paidOut);

  const stats = [
    {
      label: "Available balance",
      value: usd(balance),
      // Describe the balance using the SAME source that produced it.
      note: `${usd(collected)} in · ${usd(paidOut)} out`,
    },
    { label: "Collected this month", value: usd(collected), note: otherCurrency ? `${collectedNote} · USD only` : collectedNote },
    { label: "Paid out",             value: usd(paidOut),   note: paidOutNote },
    { label: "Active flows",         value: String(activeFlows.length), note: activeNote },
  ];

  return Response.json({ stats, mode });
}
