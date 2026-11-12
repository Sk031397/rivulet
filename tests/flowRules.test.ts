/**
 * Tests for the code-level guard rails around the AI agent (src/lib/flowRules.ts).
 * These are what stop a small model from inventing dates, payees or conditions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRecipient,
  conditionRequested,
  currencyFromPrompt,
  dateGrounded,
  dateWarnings,
  datesInText,
  deadlineFromPrompt,
  groupSizeFromPrompt,
  isContributorLabel,
  matchKnownAddress,
  validateDraft,
} from "../src/lib/flowRules.ts";

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

/* ─── dates must come from the user ─────────────────────────────────── */

test("a date the user wrote is accepted, one they didn't is not", () => {
  const future = iso(30);
  assert.equal(dateGrounded(`Pay the host on ${future}`, future), true);
  assert.equal(dateGrounded("Cabin weekend for 5 people, pay the owner 1000", iso(10)), false);
});

test("a written-out date matches the same month and day", () => {
  assert.equal(dateGrounded("everyone pays by December 5", "2026-12-05"), true);
  assert.equal(dateGrounded("everyone pays by 5th of December", "2026-12-05"), true);
  assert.equal(dateGrounded("everyone pays by December 5", "2026-12-06"), false);
});

test("relative phrases count, but a stray word like 'weekend' does not", () => {
  assert.equal(dateGrounded("everyone pays within 14 days", iso(14)), true);
  assert.equal(dateGrounded("pay by Friday", iso(3)), true);
  assert.equal(dateGrounded("Cabin weekend for 5 people", iso(14)), false);
  assert.equal(dateGrounded("a long weekend away", iso(14)), false);
});

test("dates are found in free text", () => {
  assert.ok(datesInText("on 2026-12-20 please").includes("2026-12-20"));
  assert.equal(datesInText("no dates here").length, 0);
});

test("a typed date missing from the flow is flagged", () => {
  const future = iso(40);
  const flow = { payouts: [{ label: "Host" }] };
  assert.equal(dateWarnings(`pay the host on ${future}`, flow).length, 1);
  assert.equal(dateWarnings(`pay the host on ${future}`, { payouts: [{ label: "Host", releaseOn: future }] }).length, 0);
  assert.match(dateWarnings("pay on 2020-01-01", flow)[0], /already passed/);
});

test("a requested hold that is missing is flagged", () => {
  const w = dateWarnings("pay the restaurant once the evening is over", { payouts: [{ label: "Restaurant" }] });
  assert.ok(w.some((x) => /wait for something/.test(x)));
  const held = dateWarnings("pay the restaurant once the evening is over", {
    payouts: [{ label: "Restaurant", condition: "Evening over" }],
  });
  assert.equal(held.length, 0);
});

/* ─── conditions and group size ─────────────────────────────────────── */

test("a hold is only requested when the user says something about waiting", () => {
  assert.equal(conditionRequested("pay the restaurant once the evening is over"), true);
  assert.equal(conditionRequested("release after tasks are verified"), true);
  assert.equal(conditionRequested("pay the cabin owner 1000"), false);
});

test("group size is read from the request", () => {
  assert.equal(groupSizeFromPrompt("Weekend ski trip for 6 people"), 6);
  assert.equal(groupSizeFromPrompt("a dinner for 8 friends"), 8);
  assert.equal(groupSizeFromPrompt("there are 5 of us"), 5);
  assert.equal(groupSizeFromPrompt("trip for me and 2 friends"), 3);
  assert.equal(groupSizeFromPrompt("pay the host 300"), null);
});

/* ─── payees, not contributors ──────────────────────────────────────── */

test("a payout named after a contributor is recognised", () => {
  for (const label of ["Person 1", "friend 2", "Guest #3", "Member 4"]) assert.equal(isContributorLabel(label), true, label);
  for (const label of ["Villa host", "Restaurant", "Airline", "Sam Lee"]) assert.equal(isContributorLabel(label), false, label);
});

test("a draft that pays contributors is rejected with a useful reason", () => {
  const r = validateDraft({
    name: "Dinner",
    summary: "x",
    goal: 240,
    payouts: [
      { label: "Person 1", amount: 120, note: "" },
      { label: "Person 2", amount: 120, note: "" },
    ],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.join(" "), /RECEIVING/);
});

/* ─── the money has to balance ──────────────────────────────────────── */

const draft = (over: Record<string, unknown> = {}) => ({
  name: "Trip",
  summary: "s",
  goal: 1000,
  payouts: [
    { label: "Villa", amount: 600, note: "" },
    { label: "Flights", amount: 400, note: "" },
  ],
  ...over,
});

test("payouts that add up to the goal are accepted", () => {
  assert.equal(validateDraft(draft()).ok, true);
});

test("payouts that don't add up to the goal are rejected", () => {
  assert.equal(validateDraft(draft({ goal: 1100 })).ok, false);
});

test("a goal above the limit is refused outright", () => {
  const r = validateDraft(draft({ goal: 10_000_000 }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.fatal, true);
});

test("a release date written into the condition is promoted to a real release date", () => {
  const when = iso(20);
  const r = validateDraft(
    draft({
      payouts: [
        { label: "Villa", amount: 600, note: "", condition: `On ${when}` },
        { label: "Flights", amount: 400, note: "" },
      ],
    }),
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.draft.payouts[0].releaseOn, when);
});

test("a release date in the past is rejected", () => {
  const r = validateDraft(
    draft({
      payouts: [
        { label: "Villa", amount: 600, note: "", releaseOn: "2020-01-01" },
        { label: "Flights", amount: 400, note: "" },
      ],
    }),
  );
  assert.equal(r.ok, false);
});

test("recipients are validated before they can be paid", () => {
  assert.equal(checkRecipient("sam@example.com").valid, true);
  assert.equal(checkRecipient("not an email").valid, false);
  assert.equal(
    validateDraft(draft({ payouts: [{ label: "Villa", amount: 1000, note: "", recipient: "nope" }] })).ok,
    false,
  );
});

test("a stated 'pay by' date becomes the deadline, but a payout date does not", () => {
  const future = iso(25);
  assert.equal(deadlineFromPrompt(`everyone pays by ${future}`), future);
  assert.equal(deadlineFromPrompt("pay by December 5")?.slice(5), "12-05");
  assert.equal(deadlineFromPrompt(`pay the host on ${future}`), null);
  assert.equal(deadlineFromPrompt("pay the host 300"), null);
});

/* ─── currency written in the request ───────────────────────────────── */

test("the currency is read from what the user wrote", () => {
  assert.equal(currencyFromPrompt("Lisbon: €1,800 for flights"), "EUR");
  assert.equal(currencyFromPrompt("pay the host 900 euros"), "EUR");
  assert.equal(currencyFromPrompt("a £500 deposit"), "GBP");
  assert.equal(currencyFromPrompt("400 CAD each"), "CAD");
  assert.equal(currencyFromPrompt("A$300 for the camper"), "AUD");
});

test("plain dollars, or no currency at all, mean no override", () => {
  assert.equal(currencyFromPrompt("collect $1,200 for the cabin"), null);
  assert.equal(currencyFromPrompt("cabin weekend for 5 people, 1000 total"), null);
});

test("a request that mixes currencies is flagged, not guessed", () => {
  assert.equal(currencyFromPrompt("€500 for the hotel and £300 for flights"), "MIXED");
});

/* ─── addresses misread from an invoice ─────────────────────────────── */

const known = [
  { name: "Villa host", address: "sb-a6pl453848929@personal.example.com" },
  { name: "Maya", address: "maya@example.com" },
];

test("an l read as 1 is corrected to the known address", () => {
  // The exact misread Nova Lite made on the demo invoice.
  assert.equal(matchKnownAddress("sb-a6p1453848929@personal.example.com", known), "sb-a6pl453848929@personal.example.com");
});

test("o / 0 and letter case are treated as look-alikes", () => {
  assert.equal(matchKnownAddress("MAYA@EXAMPLE.C0M", known), "maya@example.com");
});

test("an exact known address needs no correction", () => {
  assert.equal(matchKnownAddress("maya@example.com", known), null);
});

test("an address that is not a look-alike of anything known is left alone", () => {
  assert.equal(matchKnownAddress("stranger@example.com", known), null);
  assert.equal(matchKnownAddress("", known), null);
});

test("two known look-alikes are ambiguous, so nothing is guessed", () => {
  const twins = [
    { name: "A", address: "al@example.com" },
    { name: "B", address: "a1@example.com" },
  ];
  assert.equal(matchKnownAddress("ai@example.com", twins), null);
});
