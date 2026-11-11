import { getUserId } from "@/lib/session";
import { listTransactions, transactionsToActivity } from "@/lib/paypal";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const details = await listTransactions();
  if (details && details.length) {
    return Response.json({ items: transactionsToActivity(details), mode: "paypal" });
  }
  return Response.json({ items: [], mode: "empty" });
}
