import { DEMO_USER_ID, getUserId } from "@/lib/session";
import { listTransactions, transactionsToActivity } from "@/lib/paypal";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  // The shared demo account never shows the sandbox account's real PayPal history.
  const details = userId === DEMO_USER_ID ? null : await listTransactions();
  if (details && details.length) {
    return Response.json({ items: transactionsToActivity(details), mode: "paypal" });
  }
  return Response.json({ items: [], mode: "empty" });
}
