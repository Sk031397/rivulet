import { listTransactions, transactionsToStats } from "@/lib/paypal";
import { MOCK_STATS } from "@/lib/mock";

export async function GET() {
  const details = await listTransactions();
  if (details && details.length) {
    const { collected, paidOut, count } = transactionsToStats(details);
    const stats = [
      { label: "Available balance", value: "$2,480.00", note: "$640 on hold in flows" },
      { label: "Collected this month", value: `$${collected.toLocaleString()}`, note: `${count} transactions` },
      { label: "Paid out", value: `$${paidOut.toLocaleString()}`, note: "from real PayPal activity" },
      { label: "Active flows", value: "4", note: "1 needs your approval" },
    ];
    return Response.json({ stats, mode: "paypal" });
  }
  return Response.json({ stats: MOCK_STATS, mode: "mock" });
}
