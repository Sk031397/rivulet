/**
 * Shared contribution rules. Pure (no server or browser APIs) so the pay page,
 * the /api routes, and tests all run exactly the same logic.
 */

import type { Flow } from "@/data/dashboard";

/** Smallest contribution accepted, in the flow's currency. */
export const MIN_CONTRIBUTION = 1;

/* ─── Currency ───────────────────────────────────────────────────────── */

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** The currency a flow is in. Flows created before currencies existed are USD. */
export function currencyOf(flow: { currency?: string }): Currency {
  return (CURRENCIES as readonly string[]).includes(flow.currency ?? "") ? (flow.currency as Currency) : "USD";
}

/**
 * Format an amount in a currency, the same way on the server and the browser
 * (a fixed locale, so pages don't mismatch when they hydrate). "auto" drops the
 * cents on whole amounts; "fixed" always shows two decimals.
 */
export function formatMoney(n: number, currency: string = "USD", digits: "auto" | "fixed" = "fixed"): string {
  const code = (CURRENCIES as readonly string[]).includes(currency) ? currency : "USD";
  const whole = digits === "auto" && Math.round(n * 100) % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * A payout run is "in flight" if one started recently. Runs older than this are
 * treated as abandoned (e.g. the server died mid-run) so a flow can't get stuck.
 */
export const DISBURSE_LOCK_MS = 2 * 60 * 1000;

export function isDisbursing(flow: { disbursingAt?: string }): boolean {
  if (!flow.disbursingAt) return false;
  const started = Date.parse(flow.disbursingAt);
  return Number.isFinite(started) && Date.now() - started < DISBURSE_LOCK_MS;
}

/**
 * Record one settled payment on a flow (mutates `f`). Must be called inside the
 * store's row-locked update so concurrent captures are applied one at a time.
 *
 *  - Idempotent: a capture id already on the flow is ignored (`duplicate`).
 *  - Exactly one caller — the contribution that first tips the flow over its
 *    goal — gets `shouldDisburse`, and the flow moves to a holding state with
 *    the payout lock set, so everyone else sees it as already being handled.
 */
export function recordContribution(
  f: Flow,
  c: { id: string; amount: number; payer?: string; memberId?: string },
  now: Date = new Date(),
): { duplicate: boolean; shouldDisburse: boolean } {
  f.contributions ??= [];
  if (f.contributions.some((x) => x.id === c.id)) {
    return { duplicate: true, shouldDisburse: false };
  }
  // Only label the payment with a member who is actually on the roster.
  const memberId = c.memberId && f.roster?.some((m) => m.id === c.memberId) ? c.memberId : undefined;
  f.contributions.push({
    id: c.id,
    amount: c.amount,
    at: now.toISOString(),
    payer: c.payer,
    ...(memberId ? { memberId } : {}),
  });
  f.collected = Number((f.collected + c.amount).toFixed(2));
  f.contributors += 1;

  let shouldDisburse = false;
  if (f.status === "Collecting" && f.collected >= f.goal && !isDisbursing(f)) {
    f.status = "Needs approval"; // safe holding state
    // A stated release condition ("once tasks are verified") means a human has
    // to confirm it, so don't pay automatically — leave it for the owner to
    // approve. Otherwise this caller claims the single automatic payout run.
    if (!hasPendingCondition(f)) {
      f.disbursingAt = now.toISOString();
      shouldDisburse = true;
    }
  }
  return { duplicate: false, shouldDisburse };
}

/**
 * True while any not-yet-paid payout carries a release condition that only a
 * person can confirm. A payout with a release DATE is not one of these: the app
 * can check a date itself, so it never needs the owner to approve it.
 */
export function hasPendingCondition(f: Pick<Flow, "payouts">): boolean {
  return f.payouts.some(
    (p) => p.state !== "paid" && ((Boolean(p.condition) && !p.releaseOn) || Boolean(p.confirmRecipient)),
  );
}

/**
 * Mark every unpaid payout with a recipient as needing the owner's check,
 * because its address came from an AI-read invoice. Returns how many were marked.
 */
export const INVOICE_RECIPIENT_CHECK = "Check the PayPal email read from the invoice";
export function markInvoiceRecipients(f: Pick<Flow, "payouts">): number {
  let marked = 0;
  for (const p of f.payouts) {
    if (p.state === "paid" || !p.recipient) continue;
    p.confirmRecipient = true;
    p.condition ??= INVOICE_RECIPIENT_CHECK;
    marked += 1;
  }
  return marked;
}

/** Today's date as YYYY-MM-DD in UTC (the same clock the deadlines use). */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Whether an unpaid payout can be sent right now without the owner stepping in:
 * no condition at all, or a release date that has arrived. A payout with a
 * manual condition is never "due" on its own — only an owner approval releases it.
 */
export function payoutDue(
  p: { state: string; condition?: string; releaseOn?: string; confirmRecipient?: boolean },
  now: number = Date.now(),
): boolean {
  if (p.state === "paid") return false;
  // An AI-read recipient waits for the owner, even past its release date.
  if (p.confirmRecipient) return false;
  if (p.releaseOn) return p.releaseOn <= todayUtc(now);
  return !p.condition;
}

/** The moment a flow's deadline passes: the end of that calendar day, UTC. */
export function deadlineEnd(deadline: string | undefined): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const t = Date.parse(`${deadline}T23:59:59.999Z`);
  return Number.isFinite(t) ? t : null;
}

/** True once the flow's deadline day has fully passed. */
export function isPastDeadline(flow: { deadline?: string }, now: number = Date.now()): boolean {
  const end = deadlineEnd(flow.deadline);
  return end !== null && now > end;
}

/** Whole days left until the deadline day ends (0 = ends today), or null with no deadline. */
export function daysLeft(flow: { deadline?: string }, now: number = Date.now()): number | null {
  const end = deadlineEnd(flow.deadline);
  if (end === null) return null;
  return Math.max(0, Math.ceil((end - now) / 86_400_000) - 1);
}

/**
 * One person's share of a group flow, in USD (rounded up to the cent so a group
 * of equal shares always covers the goal). Null when the flow has no group size.
 */
export function shareFor(flow: { goal: number; participants?: number }): number | null {
  const n = flow.participants;
  if (!n || n < 2 || !Number.isInteger(n)) return null;
  return Math.ceil((flow.goal * 100) / n) / 100;
}

/** A payment that is still holding the contributor's money: not refunded, not reversed. */
export function isLive(c: { refundedAt?: string; reversedAt?: string }): boolean {
  return !c.refundedAt && !c.reversedAt;
}

/** Contributions that are still holding the contributor's money (not yet refunded). */
export function refundable(flow: Pick<Flow, "contributions">) {
  return (flow.contributions ?? []).filter(isLive);
}

/**
 * Bring `collected` and `contributors` back in line with the payments that are
 * still live. Called after anything that can take money back out of a flow.
 */
export function recomputeTotals(f: Flow): void {
  const live = refundable(f);
  f.collected = Number((live.reduce((s, c) => s + toCents(c.amount), 0) / 100).toFixed(2));
  f.contributors = live.length;
}

/** Payments PayPal later flagged: disputed, reversed or denied. Owner-facing. */
export function paymentIssues(flow: Pick<Flow, "contributions">) {
  return (flow.contributions ?? []).filter((c) => c.issue);
}

/**
 * Whether the owner (or the deadline job) may return contributors' money. Not
 * once the flow has paid out, and not while a payout run is in flight.
 */
export function canRefund(flow: Flow): { ok: true } | { ok: false; error: string } {
  if (flow.status === "Paid out") return { ok: false, error: "This flow has already paid out." };
  if (isDisbursing(flow)) return { ok: false, error: "A payout is in progress — try again in a minute." };
  if (flow.payouts.some((p) => p.state === "paid")) {
    return { ok: false, error: "Some payouts were already sent, so the money can't be returned in full." };
  }
  if (refundable(flow).length === 0) return { ok: false, error: "There is nothing to refund." };
  return { ok: true };
}

const toCents = (n: number) => Math.round(n * 100);

/** How much is still needed to reach the goal, in USD, never negative. */
export function remainingFor(flow: { goal: number; collected: number }): number {
  return Math.max(0, (toCents(flow.goal) - toCents(flow.collected)) / 100);
}

/**
 * Validate a requested contribution against a flow. Returns the amount rounded
 * to cents, or an error message the caller can show to the contributor.
 */
export function validateContribution(
  flow: { goal: number; collected: number; status: string; deadline?: string; currency?: string },
  requested: number,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (flow.status !== "Collecting") {
    return { ok: false, error: "This flow is no longer collecting contributions." };
  }
  if (isPastDeadline(flow)) {
    return { ok: false, error: "The deadline for this flow has passed." };
  }
  const remaining = remainingFor(flow);
  if (remaining <= 0) {
    return { ok: false, error: "This flow is already fully funded." };
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, error: "Enter an amount to contribute." };
  }
  const amount = toCents(requested) / 100;
  // Allow a final contribution below the minimum if it's exactly what's left.
  if (amount < MIN_CONTRIBUTION && amount !== remaining) {
    return { ok: false, error: `The minimum contribution is ${formatMoney(MIN_CONTRIBUTION, flow.currency)}.` };
  }
  if (amount > remaining) {
    return { ok: false, error: `Only ${formatMoney(remaining, flow.currency)} is still needed — enter that or less.` };
  }
  return { ok: true, amount };
}

/* ─── Roster: who in the group has paid ──────────────────────────────── */

export const MAX_ROSTER = 50;

export type MemberState = "paid" | "partial" | "unpaid";

export interface MemberStatus {
  id: string;
  name: string;
  /** Money from this person that has not been refunded. */
  paid: number;
  /** What they still owe against their share (0 when the flow has no fixed share). */
  outstanding: number;
  state: MemberState;
}

/**
 * Who has paid and who hasn't, derived from the real contributions — never
 * stored separately, so it can't drift out of step with the money.
 */
export function rosterStatus(
  flow: Pick<Flow, "goal" | "roster" | "participants" | "contributions">,
): MemberStatus[] {
  const roster = flow.roster ?? [];
  const share = shareFor({ goal: flow.goal, participants: flow.participants ?? roster.length });
  return roster.map((m) => {
    const paidCents = (flow.contributions ?? [])
      .filter((c) => c.memberId === m.id && isLive(c))
      .reduce((s, c) => s + toCents(c.amount), 0);
    const owedCents = share === null ? 0 : toCents(share);
    const outstandingCents = Math.max(0, owedCents - paidCents);
    const state: MemberState =
      share === null
        ? paidCents > 0 ? "paid" : "unpaid"
        : outstandingCents === 0 ? "paid" : paidCents > 0 ? "partial" : "unpaid";
    return { id: m.id, name: m.name, paid: paidCents / 100, outstanding: outstandingCents / 100, state };
  });
}

/** A name safe to show and to put in an email: letters, numbers, spaces, . ' - only. */
export function cleanMemberName(raw: unknown): string | null {
  const s = String(raw ?? "")
    .replace(/[^\p{L}\p{N} .'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return s.length > 0 ? s : null;
}

/** The nudge the organizer can paste into the group chat (or that is emailed). */
export function reminderText(opts: { flowName: string; name: string; owed: number; link: string; deadline?: string; currency?: string }): string {
  const amount = formatMoney(opts.owed, opts.currency);
  const due = opts.deadline ? ` by ${opts.deadline}` : "";
  return `Hi ${opts.name}, your ${amount} share for ${opts.flowName} is still open. Please pay${due}: ${opts.link}`;
}

/* ─── Someone drops out ──────────────────────────────────────────────── */

export type ResplitMode = "keep" | "shrink";

export type ResplitPlan =
  | { ok: true; participants: number; goal: number; share: number; payouts: number[] }
  | { ok: false; error: string };

/** Scale cent amounts to a new total, keeping their proportions and summing exactly. */
function scaleCents(amounts: number[], targetCents: number): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (total <= 0) return amounts;
  const exact = amounts.map((a) => (a * targetCents) / total);
  const floors = exact.map(Math.floor);
  let left = targetCents - floors.reduce((s, a) => s + a, 0);
  // Hand the leftover cents to the largest fractional parts.
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * What happens to the numbers if `removed` people leave a group flow.
 *
 *  - "keep":   the cost stays the same, so each remaining person's share rises.
 *  - "shrink": the cost falls with them (per-person costs like flights), so the
 *              goal and every payout are scaled down in proportion.
 *
 * Pure, so the owner's screen can preview it and the server can apply it using
 * the same code. Refuses anything that would leave people overpaid or touch a
 * payout that has already been sent.
 */
export function planResplit(
  flow: Pick<Flow, "goal" | "participants" | "roster" | "payouts" | "contributions">,
  removed: number,
  mode: ResplitMode,
): ResplitPlan {
  const oldN = flow.roster?.length ?? flow.participants ?? 0;
  const newN = oldN - removed;
  if (!Number.isInteger(oldN) || oldN < 2) return { ok: false, error: "This flow has no group to re-split." };
  if (removed < 1) return { ok: false, error: "Nobody is being removed." };
  if (newN < 2) return { ok: false, error: "A group needs at least two people." };

  const amounts = flow.payouts.map((p) => toCents(p.amount));
  const goalCents = toCents(flow.goal);

  if (mode === "keep") {
    return {
      ok: true,
      participants: newN,
      goal: flow.goal,
      share: Math.ceil(goalCents / newN) / 100,
      payouts: amounts.map((a) => a / 100),
    };
  }

  if (flow.payouts.some((p) => p.state === "paid")) {
    return { ok: false, error: "Some payouts were already sent, so the amounts can't be scaled down." };
  }
  const newGoalCents = Math.round((goalCents * newN) / oldN);
  const liveCents = refundable(flow).reduce((s, c) => s + toCents(c.amount), 0);
  if (liveCents > newGoalCents) {
    return {
      ok: false,
      error: "People have already paid more than the new total would be. Refund someone first, or keep the cost the same.",
    };
  }
  return {
    ok: true,
    participants: newN,
    goal: newGoalCents / 100,
    share: Math.ceil(newGoalCents / newN) / 100,
    payouts: scaleCents(amounts, newGoalCents).map((a) => a / 100),
  };
}
