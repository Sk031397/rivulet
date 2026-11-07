import { listTransactions, transactionsToStats } from "@/lib/paypal";
import { getAllFlows } from "@/lib/store";
import { MOCK_STATS } from "@/lib/mock";

export async function GET() {
  // Always read live flow data from the store
  const flows = getAllFlows();
  const activeFlows = flows.filter((f) => f.status !== "Paid out");
  const needsApproval = flows.filter((f) => f.status === "Needs approval").length;
  const totalCollected = flows.reduce((sum, f) => sum + f.collected, 0);
  const totalPaidOut = flows
    .filter((f) => f.status === "Paid out")
    .reduce((sum, f) => sum + f.goal, 0);

  // Active flows note
  const activeNote =
    needsApproval > 0
      ? `${needsApproval} need${needsApproval === 1 ? "s" : ""} your approval`
      : activeFlows.length === 0
        ? "No active flows"
        : `${activeFlows.filter((f) => f.status === "Collecting").length} collecting`;

  // Try to enrich balance + collected/paidOut with real PayPal transaction data
  const details = await listTransactions();
  if (details && details.length) {
    const { collected: ppCollected, paidOut: ppPaidOut, count } = transactionsToStats(details);

    // Prefer PayPal data for the money figures; use flow store for active flows count
    const collected = Math.max(ppCollected, totalCollected);
    const paidOut = Math.max(ppPaidOut, totalPaidOut);
    const balance = Math.max(0, collected - paidOut);

    const stats = [
      {
        label: "Available balance",
        value: `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: totalCollected > 0 ? `$${totalCollected.toFixed(2)} collected across flows` : `${count} transactions`,
      },
      {
        label: "Collected this month",
        value: `$${collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: `${count} transaction${count === 1 ? "" : "s"} via PayPal`,
      },
      {
        label: "Paid out",
        value: `$${paidOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: paidOut > 0 ? "from real PayPal activity" : "No payouts yet",
      },
      {
        label: "Active flows",
        value: String(activeFlows.length),
        note: activeNote,
      },
    ];
    return Response.json({ stats, mode: "paypal" });
  }

  // No PayPal transactions — derive everything from the flow store only
  if (flows.length > 0) {
    const stats = [
      {
        label: "Available balance",
        value: `$${Math.max(0, totalCollected - totalPaidOut).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: totalCollected > 0 ? `$${totalCollected.toFixed(2)} collected across flows` : "No funds yet",
      },
      {
        label: "Collected this month",
        value: `$${totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: `${flows.reduce((s, f) => s + f.contributors, 0)} contributor${flows.reduce((s, f) => s + f.contributors, 0) === 1 ? "" : "s"} across all flows`,
      },
      {
        label: "Paid out",
        value: `$${totalPaidOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        note: totalPaidOut > 0 ? `${flows.filter((f) => f.status === "Paid out").length} flow${flows.filter((f) => f.status === "Paid out").length === 1 ? "" : "s"} completed` : "No payouts yet",
      },
      {
        label: "Active flows",
        value: String(activeFlows.length),
        note: activeNote,
      },
    ];
    return Response.json({ stats, mode: "flows" });
  }

  return Response.json({ stats: MOCK_STATS, mode: "mock" });
}
