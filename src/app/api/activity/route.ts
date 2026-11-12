import { getUserId } from "@/lib/session";
import { listTransactions, transactionsToActivity } from "@/lib/paypal";
import { getAllFlows } from "@/lib/store";
import { ownTransactions } from "@/lib/ownTransactions";

/**
 * GET /api/activity — recent PayPal activity for the signed-in user.
 * The PayPal account is shared by every user, so only transactions that
 * belong to this user's own flows (their contributors' payments and the
 * refunds they issued) are shown.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const details = ownTransactions(await listTransactions(), await getAllFlows(userId));
  if (details.length) {
    return Response.json({ items: transactionsToActivity(details), mode: "paypal" });
  }
  return Response.json({ items: [], mode: "empty" });
}