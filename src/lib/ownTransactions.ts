/**
 * The app uses ONE PayPal account for everyone, so its transaction history
 * holds every user's payments. Before showing any of it, keep only the
 * transactions that belong to this user's own flows: a contributor's payment
 * (PayPal transaction id = our recorded capture id) or a refund we issued
 * (transaction id = our recorded refund id). Everything else is someone
 * else's money and must not be shown.
 */

import type { Flow } from "@/data/dashboard";
import type { PayPalTransaction } from "./paypal.ts";

/** Every PayPal transaction id this user's flows know about. */
export function ownTransactionIds(flows: Array<Pick<Flow, "contributions">>): Set<string> {
  const ids = new Set<string>();
  for (const f of flows) {
    for (const c of f.contributions ?? []) {
      ids.add(c.id);
      if (c.refundId) ids.add(c.refundId);
    }
  }
  return ids;
}

/** Only the transactions that belong to these flows. */
export function ownTransactions(
  details: PayPalTransaction[] | null | undefined,
  flows: Array<Pick<Flow, "contributions">>,
): PayPalTransaction[] {
  const ids = ownTransactionIds(flows);
  return (details ?? []).filter((t) => {
    const id = t.transaction_info?.transaction_id;
    return Boolean(id && ids.has(id));
  });
}
