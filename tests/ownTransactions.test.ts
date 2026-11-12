/**
 * The PayPal account is shared by every user of the app. These tests pin down
 * that one user only ever sees PayPal transactions from their own flows.
 * Run with: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ownTransactionIds, ownTransactions } from "../src/lib/ownTransactions.ts";
import type { PayPalTransaction } from "../src/lib/paypal.ts";

const tx = (transaction_id?: string, value = "25.00"): PayPalTransaction => ({
  transaction_info: { transaction_id, transaction_amount: { value, currency_code: "USD" } },
  payer_info: { email_address: "someone@example.com" },
});

const myFlows = [
  {
    contributions: [
      { id: "CAP-MINE-1", amount: 25, at: "2026-11-10T00:00:00Z" },
      { id: "CAP-MINE-2", amount: 25, at: "2026-11-10T00:00:00Z", refundId: "REF-MINE-2" },
    ],
  },
  { contributions: undefined },
];

test("collects every capture and refund id from the user's flows", () => {
  assert.deepEqual([...ownTransactionIds(myFlows)].sort(), ["CAP-MINE-1", "CAP-MINE-2", "REF-MINE-2"]);
});

test("another user's payments on the shared PayPal account are never returned", () => {
  const all = [tx("CAP-MINE-1"), tx("CAP-SOMEONE-ELSE"), tx("REF-MINE-2", "-25.00"), tx("PAYOUT-OTHER", "-500.00")];
  const mine = ownTransactions(all, myFlows).map((t) => t.transaction_info.transaction_id);
  assert.deepEqual(mine, ["CAP-MINE-1", "REF-MINE-2"]);
});

test("a user with no flows sees no PayPal history at all", () => {
  assert.deepEqual(ownTransactions([tx("CAP-MINE-1"), tx("CAP-SOMEONE-ELSE")], []), []);
});

test("transactions without an id, and a missing history, are handled", () => {
  assert.deepEqual(ownTransactions([tx(undefined)], myFlows), []);
  assert.deepEqual(ownTransactions(null, myFlows), []);
  assert.deepEqual(ownTransactions(undefined, myFlows), []);
});
