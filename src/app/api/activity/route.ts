import { listTransactions, transactionsToActivity } from "@/lib/paypal";
import { MOCK_ACTIVITY } from "@/lib/mock";

export async function GET() {
  const details = await listTransactions();
  if (details && details.length) {
    return Response.json({ items: transactionsToActivity(details), mode: "paypal" });
  }
  return Response.json({ items: MOCK_ACTIVITY, mode: "mock" });
}
