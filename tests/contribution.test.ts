/**
 * Tests for the shared money rules (src/lib/contribution.ts). These are the
 * rules the pay page, the API routes and the refund job all share, so a mistake
 * here is a mistake with real money. Run with: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canRefund,
  cleanMemberName,
  daysLeft,
  deadlineEnd,
  hasPendingCondition,
  isPastDeadline,
  payoutDue,
  paymentIssues,
  recomputeTotals,
  recordContribution,
  refundable,
  remainingFor,
  reminderText,
  rosterStatus,
  shareFor,
  todayUtc,
  validateContribution,
} from "../src/lib/contribution.ts";
import type { Flow } from "../src/data/dashboard.ts";

const flow = (over: Partial<Flow> = {}): Flow => ({
  id: "trip-abcd",
  name: "Trip",
  status: "Collecting",
  collected: 0,
  goal: 100,
  contributors: 0,
  contributions: [],
  payouts: [{ id: "trip-abcd-p0", label: "Villa", amount: 100, state: "pending", note: "" }],
  ...over,
});

/* ─── recording contributions ───────────────────────────────────────── */

test("a payment is recorded once, however many times it is replayed", () => {
  const f = flow();
  assert.equal(recordContribution(f, { id: "CAP1", amount: 25 }).duplicate, false);
  assert.equal(recordContribution(f, { id: "CAP1", amount: 25 }).duplicate, true);
  assert.equal(f.collected, 25);
  assert.equal(f.contributors, 1);
});

test("only the payment that tips the flow over its goal triggers payouts", () => {
  const f = flow();
  const results = [60, 30, 10, 5].map((amount, i) => recordContribution(f, { id: `C${i}`, amount }));
  assert.deepEqual(results.map((r) => r.shouldDisburse), [false, false, true, false]);
  assert.equal(f.status, "Needs approval");
  assert.ok(f.disbursingAt, "payout lock is set for the one caller who pays out");
});

test("cents are summed without floating-point drift", () => {
  const f = flow({ goal: 1 });
  for (let i = 0; i < 10; i++) recordContribution(f, { id: `C${i}`, amount: 0.1 });
  assert.equal(f.collected, 1);
  assert.equal(remainingFor(f), 0);
});

test("a release condition holds the flow for the owner instead of paying out", () => {
  const f = flow({
    payouts: [{ id: "p0", label: "Venue", amount: 100, state: "pending", note: "", condition: "After the event" }],
  });
  assert.equal(hasPendingCondition(f), true);
  const r = recordContribution(f, { id: "C1", amount: 100 });
  assert.equal(r.shouldDisburse, false);
  assert.equal(f.status, "Needs approval");
  assert.equal(f.disbursingAt, undefined);
});

test("a payment is only labelled with a member who is on the roster", () => {
  const f = flow({ roster: [{ id: "m0", name: "Sam" }, { id: "m1", name: "Priya" }] });
  recordContribution(f, { id: "A", amount: 10, memberId: "m1" });
  recordContribution(f, { id: "B", amount: 10, memberId: "someone-made-up" });
  assert.equal(f.contributions?.[0].memberId, "m1");
  assert.equal(f.contributions?.[1].memberId, undefined);
});

/* ─── validating a contribution ─────────────────────────────────────── */

test("contributions are validated against what the flow can still take", () => {
  const f = flow({ collected: 90 });
  assert.equal(validateContribution(f, 10).ok, true);
  assert.equal(validateContribution(f, 10.01).ok, false, "more than is left");
  assert.equal(validateContribution(f, 0).ok, false);
  assert.equal(validateContribution(f, Number.NaN).ok, false);
  assert.equal(validateContribution(f, 0.5).ok, false, "below the minimum");
});

test("a final payment below the minimum is allowed if it is exactly what is left", () => {
  assert.equal(validateContribution(flow({ collected: 99.5 }), 0.5).ok, true);
});

test("a flow that is not collecting accepts nothing", () => {
  for (const status of ["Needs approval", "Paid out", "Refunded"] as const) {
    assert.equal(validateContribution(flow({ status }), 10).ok, false, status);
  }
});

/* ─── deadlines ─────────────────────────────────────────────────────── */

test("the deadline day itself is still open; the next day is not", () => {
  const end = deadlineEnd("2026-03-01");
  assert.ok(end);
  assert.equal(isPastDeadline({ deadline: "2026-03-01" }, end - 1), false);
  assert.equal(isPastDeadline({ deadline: "2026-03-01" }, end + 1), true);
});

test("malformed or missing deadlines never expire a flow", () => {
  assert.equal(isPastDeadline({}), false);
  assert.equal(isPastDeadline({ deadline: "soon" }), false);
  assert.equal(deadlineEnd("2026-13-45"), null);
  assert.equal(daysLeft({}), null);
});

test("no contribution is accepted after the deadline", () => {
  assert.equal(validateContribution(flow({ deadline: "2020-01-01" }), 10).ok, false);
  assert.equal(validateContribution(flow({ deadline: "2999-01-01" }), 10).ok, true);
});

/* ─── shares ────────────────────────────────────────────────────────── */

test("shares round up so equal shares always cover the goal", () => {
  assert.equal(shareFor({ goal: 100, participants: 3 }), 33.34);
  assert.equal(shareFor({ goal: 1600, participants: 4 }), 400);
  assert.equal(shareFor({ goal: 100, participants: 1 }), null);
  assert.equal(shareFor({ goal: 100 }), null);
});

/* ─── refunds ───────────────────────────────────────────────────────── */

test("refunds are allowed before payout and refused after", () => {
  const paid = flow({ collected: 30, contributions: [{ id: "A", amount: 30, at: "x" }] });
  assert.equal(canRefund(paid).ok, true);
  assert.equal(canRefund({ ...paid, status: "Paid out" }).ok, false);
  assert.equal(
    canRefund({ ...paid, payouts: [{ ...paid.payouts[0], state: "paid" }] }).ok,
    false,
    "a payout was already sent",
  );
  assert.equal(canRefund({ ...paid, disbursingAt: new Date().toISOString() }).ok, false, "payout in flight");
});

test("nothing is refundable when there is nothing left to return", () => {
  const f = flow({ contributions: [{ id: "A", amount: 10, at: "x", refundedAt: "y" }] });
  assert.equal(refundable(f).length, 0);
  assert.equal(canRefund(f).ok, false);
});

/* ─── roster ────────────────────────────────────────────────────────── */

test("who has paid is worked out from the money, not stored", () => {
  const f = flow({
    goal: 400,
    roster: [
      { id: "m0", name: "Me" },
      { id: "m1", name: "Sam" },
      { id: "m2", name: "Priya" },
      { id: "m3", name: "Jo" },
    ],
    contributions: [
      { id: "A", amount: 100, at: "x", memberId: "m0" },
      { id: "B", amount: 40, at: "x", memberId: "m1" },
      { id: "C", amount: 100, at: "x", memberId: "m2", refundedAt: "y" },
    ],
  });
  const by = Object.fromEntries(rosterStatus(f).map((s) => [s.name, s]));
  assert.equal(by.Me.state, "paid");
  assert.equal(by.Sam.state, "partial");
  assert.equal(by.Sam.outstanding, 60);
  assert.equal(by.Priya.state, "unpaid", "a refunded payment no longer counts");
  assert.equal(by.Jo.outstanding, 100);
});

test("member names are scrubbed before they are shown or emailed", () => {
  assert.equal(cleanMemberName("  Sam <script>  "), "Sam script");
  assert.equal(cleanMemberName("<>"), null);
  assert.equal(cleanMemberName(undefined), null);
  assert.equal(cleanMemberName("x".repeat(100))?.length, 40);
});

test("the reminder message names the person, the amount and the link", () => {
  const text = reminderText({ flowName: "Lisbon", name: "Sam", owed: 400, link: "https://x/pay/1", deadline: "2026-03-01" });
  assert.match(text, /Sam/);
  assert.match(text, /\$400\.00/);
  assert.match(text, /2026-03-01/);
  assert.match(text, /https:\/\/x\/pay\/1/);
});

/* ─── scheduled release dates ───────────────────────────────────────── */

const DAY = 86_400_000;

test("a payout with no condition is due; one with a manual condition never is", () => {
  assert.equal(payoutDue({ state: "pending" }), true);
  assert.equal(payoutDue({ state: "pending", condition: "Tasks verified" }), false);
  assert.equal(payoutDue({ state: "paid" }), false);
});

test("a dated payout becomes due on its release day, not before", () => {
  const today = todayUtc();
  const tomorrow = todayUtc(Date.now() + DAY);
  const yesterday = todayUtc(Date.now() - DAY);
  assert.equal(payoutDue({ state: "pending", releaseOn: tomorrow, condition: `Released on ${tomorrow}` }), false);
  assert.equal(payoutDue({ state: "pending", releaseOn: today }), true);
  assert.equal(payoutDue({ state: "pending", releaseOn: yesterday }), true);
});

test("a release date does not hold the flow for the owner, but a manual condition does", () => {
  const dated = flow({
    payouts: [{ id: "p0", label: "Host", amount: 100, state: "pending", note: "", condition: "On 2999-01-01", releaseOn: "2999-01-01" }],
  });
  assert.equal(hasPendingCondition(dated), false);
  const manual = flow({
    payouts: [{ id: "p0", label: "Host", amount: 100, state: "pending", note: "", condition: "After the event" }],
  });
  assert.equal(hasPendingCondition(manual), true);
});

test("reaching the goal with only dated payouts still claims the payout run", () => {
  const f = flow({
    payouts: [{ id: "p0", label: "Host", amount: 100, state: "pending", note: "", condition: "On 2999-01-01", releaseOn: "2999-01-01" }],
  });
  assert.equal(recordContribution(f, { id: "C1", amount: 100 }).shouldDisburse, true);
});

/* ─── money taken back out after the fact ───────────────────────────── */

test("a reversed or refunded payment stops counting toward the total", () => {
  const f = flow({ goal: 100 });
  recordContribution(f, { id: "A", amount: 40 });
  recordContribution(f, { id: "B", amount: 30 });
  f.contributions![1].reversedAt = "now";
  f.contributions![0].refundedAt = "now";
  recomputeTotals(f);
  assert.equal(f.collected, 0);
  assert.equal(f.contributors, 0);
  assert.equal(refundable(f).length, 0, "a reversed payment can't be refunded again");
});

test("a reversed payment frees its member's share to be paid again", () => {
  const f = flow({
    goal: 200,
    roster: [{ id: "m0", name: "Sam" }, { id: "m1", name: "Jo" }],
    contributions: [{ id: "A", amount: 100, at: "x", memberId: "m0", reversedAt: "y" }],
  });
  assert.equal(rosterStatus(f)[0].state, "unpaid");
});

test("payments PayPal flagged are listed for the owner", () => {
  const f = flow({
    contributions: [
      { id: "A", amount: 10, at: "x" },
      { id: "B", amount: 10, at: "x", issue: "The payer opened a dispute with PayPal." },
    ],
  });
  assert.deepEqual(paymentIssues(f).map((c) => c.id), ["B"]);
});
