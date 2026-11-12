import { getUserId } from "@/lib/session";
import { getAllFlows } from "@/lib/store";
import { currencyOf } from "@/lib/contribution";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * GET /api/stats — overview figures for the signed-in user.
 *
 * Built only from this user's own flows. (The PayPal account's transaction
 * history is shared by every user of the app, so it can't be used for one
 * person's totals.) Collected excludes refunded and reversed payments, and
 * paid out counts payouts that were actually sent.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Totals add amounts together, so they count US-dollar flows only; flows in
  // other currencies are shown on their own.
  const allFlows = await getAllFlows(userId);
  const otherCurrency = allFlows.filter((f) => currencyOf(f) !== "USD").length;
  const flows = allFlows.filter((f) => currencyOf(f) === "USD");

  if (flows.length === 0 && otherCurrency === 0) {
    return Response.json({
      stats: [
        { label: "Available balance", value: "$0.00", note: "No transactions yet" },
        { label: "Collected", value: "$0.00", note: "Create a flow to collect" },
        { label: "Paid out", value: "$0.00", note: "No payouts yet" },
        { label: "Active flows", value: "0", note: "Create your first flow" },
      ],
      mode: "empty",
    });
  }

  const activeFlows = allFlows.filter((f) => f.status !== "Paid out" && f.status !== "Refunded");
  const needsApproval = allFlows.filter((f) => f.status === "Needs approval").length;
  const collected = flows.reduce((sum, f) => sum + f.collected, 0);
  const paidOut = flows.reduce(
    (sum, f) => sum + f.payouts.filter((p) => p.state === "paid").reduce((s, p) => s + p.amount, 0),
    0,
  );
  const balance = Math.max(0, collected - paidOut);

  const contributors = flows.reduce((s, f) => s + f.contributors, 0);
  const paidFlows = flows.filter((f) => f.status === "Paid out").length;
  const usdOnly = otherCurrency ? " · USD only" : "";

  const activeNote =
    needsApproval > 0
      ? `${needsApproval} need${needsApproval === 1 ? "s" : ""} your approval`
      : activeFlows.length === 0
        ? "No active flows"
        : `${activeFlows.filter((f) => f.status === "Collecting").length} collecting`;

  const stats = [
    { label: "Available balance", value: usd(balance), note: `${usd(collected)} in · ${usd(paidOut)} out` },
    {
      label: "Collected",
      value: usd(collected),
      note: `${contributors} contributor${contributors === 1 ? "" : "s"} across your flows${usdOnly}`,
    },
    {
      label: "Paid out",
      value: usd(paidOut),
      note: paidOut > 0 ? `${paidFlows} flow${paidFlows === 1 ? "" : "s"} completed` : "No payouts yet",
    },
    { label: "Active flows", value: String(activeFlows.length), note: activeNote },
  ];

  return Response.json({ stats, mode: "flows" });
}
