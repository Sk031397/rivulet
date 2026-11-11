/**
 * Pure rules for flows and recipients. No runtime imports, so the AI agent's
 * tools, the API routes, and tests all run exactly the same code.
 */

/* ── recipients ─────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Optional +, then 7–15 digits (E.164-ish) once separators are stripped.
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

export const normalizePhone = (v: string) => v.replace(/[\s\-.()]/g, "");

/** Values models (and old data) use to mean "no recipient". */
const BLANK_WORDS = new Set(["", "null", "none", "n/a", "na", "unknown", "undefined", "tbd", "-"]);

export function isBlankRecipient(raw: string | null | undefined): boolean {
  return BLANK_WORDS.has((raw ?? "").trim().toLowerCase());
}

export type RecipientCheck =
  | { valid: true; type: "EMAIL" | "PHONE"; value: string }
  | { valid: false; reason: string };

export function checkRecipient(raw: string): RecipientCheck {
  const v = (raw ?? "").trim();
  if (!v) return { valid: false, reason: "No recipient given." };
  if (v.includes("@")) {
    return EMAIL_RE.test(v)
      ? { valid: true, type: "EMAIL", value: v }
      : { valid: false, reason: "That doesn't look like a valid email address." };
  }
  const phone = normalizePhone(v);
  return PHONE_RE.test(phone)
    ? { valid: true, type: "PHONE", value: phone }
    : { valid: false, reason: "Not a valid email address or phone number (7–15 digits)." };
}

/**
 * For the PATCH route: returns the cleaned recipient, "" to clear it, or null
 * if the value is invalid.
 */
export function cleanRecipient(raw: string): string | null {
  if (isBlankRecipient(raw)) return "";
  const c = checkRecipient(raw);
  return c.valid ? c.value : null;
}

/* ── contacts ───────────────────────────────────────────────────────── */

export interface Contact {
  name: string;
  /** Email address or phone number. */
  address: string;
}

/** "maya.lee@x.com" → "Maya Lee"; phone numbers are returned as-is. */
export function nameFromAddress(address: string): string {
  if (!address.includes("@")) return address;
  return address
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Find contacts matching a free-text query. Every word in the query must appear
 * in the contact's name or address ("maya lee" matches "Maya Lee"). An empty
 * query returns the first few contacts.
 */
export function searchContacts(query: string, contacts: Contact[], limit = 5): Contact[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = tokens.length
    ? contacts.filter((c) => {
        const hay = `${c.name} ${c.address}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
    : contacts;
  const first = tokens[0] ?? "";
  return [...matches]
    .sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(first) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(first) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/* ── model output ───────────────────────────────────────────────────── */

/**
 * Make a model's final message safe to show: drop internal `<thinking>` blocks
 * (including an unclosed one), collapse whitespace, and cap the length.
 */
export function cleanModelReply(text: string, max = 400): string {
  const out = (text ?? "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, " ")
    .replace(/<thinking>[\s\S]*$/i, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ") // stray wrapper tags such as <response>
    .replace(/\s+/g, " ")
    .trim();
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

/* ── flow drafts ────────────────────────────────────────────────────── */

export const MAX_GOAL = 100_000;
export const MAX_PAYOUTS = 8;
/** Used when a payout has no note, so the owner always sees when it releases. */
export const DEFAULT_PAYOUT_NOTE = "Released when the goal is reached.";

/**
 * Things the agent can't do, caught from the user's wording so they're told
 * plainly instead of having the request silently ignored.
 */
export function unsupportedRequestWarnings(prompt: string): string[] {
  const out: string[] = [];
  if (/\balready\s+(been\s+)?paid\b|\bmark(?:ed)?\b[^.]*\bas\s+paid\b/i.test(prompt ?? "")) {
    out.push("Payouts always start as pending — marking a payout as already paid isn't supported, so it will still be paid out.");
  }
  return out;
}

export interface DraftPayout {
  label: string;
  amount: number;
  note: string;
  condition?: string | null;
  recipient?: string | null;
}

export interface FlowDraft {
  name: string;
  summary: string;
  goal: number;
  payouts: DraftPayout[];
}

export interface CleanDraft {
  name: string;
  summary: string;
  goal: number;
  payouts: Array<{ label: string; amount: number; note: string; condition?: string; recipient?: string }>;
}

const toCents = (n: number) => Math.round(n * 100);
const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dollar figures written like "$50" or "$1,200.50" in free text, as cents. */
export function dollarAmountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of (text ?? "").matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(toCents(n));
  }
  return out;
}

/**
 * Check the request BEFORE spending a model call. A dollar figure over the
 * per-flow limit is refused outright: left to the model, it tends to quietly
 * shrink the amount to fit, which would build a flow the user never asked for.
 */
export function preflightProblem(prompt: string): string | null {
  const biggest = Math.max(0, ...dollarAmountsIn(prompt));
  if (biggest > MAX_GOAL * 100) {
    return `flows are limited to $${MAX_GOAL.toLocaleString("en-US")} each, and you mentioned ${usd(biggest)}. Try a smaller amount, or split it across several flows.`;
  }
  return null;
}

/**
 * Catch a model silently changing money: every dollar figure the user typed
 * should appear in the flow (as the goal or a payout). Returns a plain-English
 * warning for each one that doesn't, so the user can check before sharing.
 */
export function missingAmountWarnings(
  prompt: string,
  flow: { goal: number; payouts: Array<{ amount: number }> },
): string[] {
  const have = new Set<number>([toCents(flow.goal), ...flow.payouts.map((p) => toCents(p.amount))]);
  const missing = [...new Set(dollarAmountsIn(prompt))].filter((c) => !have.has(c));
  return missing.map(
    (c) => `You mentioned ${usd(c)}, but that amount isn't in this flow — double-check the payout amounts.`,
  );
}

/**
 * Validate a flow the agent wants to create. Errors are written for the model
 * to read and act on, since it gets to fix them and try again.
 */
export function validateDraft(
  d: FlowDraft,
): { ok: true; draft: CleanDraft; warnings: string[] } | { ok: false; errors: string[]; fatal?: boolean } {
  const errors: string[] = [];
  // Set when retrying can't help (the request itself is out of bounds).
  let fatal = false;
  const warnings: string[] = [];

  const name = (d.name ?? "").trim().slice(0, 80);
  const summary = (d.summary ?? "").trim().slice(0, 240);
  if (!name) errors.push("name is required.");

  const goalCents = toCents(Number(d.goal));
  if (!Number.isFinite(goalCents) || goalCents <= 0) {
    errors.push("goal must be a positive dollar amount.");
  } else if (goalCents > MAX_GOAL * 100) {
    fatal = true;
    errors.push(
      `goal can't exceed $${MAX_GOAL.toLocaleString("en-US")}. Do NOT lower the amount yourself and do not call create_flow again — tell the user about the limit instead.`,
    );
  }

  const payouts = Array.isArray(d.payouts) ? d.payouts : [];
  if (payouts.length < 1) errors.push("at least one payout is required.");
  if (payouts.length > MAX_PAYOUTS) errors.push(`at most ${MAX_PAYOUTS} payouts are allowed.`);

  const seenLabels = new Set<string>();
  let sumCents = 0;
  const clean: CleanDraft["payouts"] = [];

  payouts.forEach((p, i) => {
    const label = (p.label ?? "").trim().slice(0, 60);
    const where = label ? `payout "${label}"` : `payout #${i + 1}`;
    if (!label) errors.push(`payout #${i + 1} needs a label.`);
    else if (seenLabels.has(label.toLowerCase())) errors.push(`payout labels must be unique ("${label}" is repeated).`);
    seenLabels.add(label.toLowerCase());

    const cents = toCents(Number(p.amount));
    if (!Number.isFinite(cents) || cents <= 0) errors.push(`${where} needs a positive amount.`);
    else sumCents += cents;

    let recipient: string | undefined;
    if (!isBlankRecipient(p.recipient)) {
      const check = checkRecipient(p.recipient as string);
      if (!check.valid) {
        errors.push(`${where} has an invalid recipient ("${p.recipient}"): ${check.reason} Omit the recipient if it isn't known.`);
      } else {
        recipient = check.value;
        if (check.type === "PHONE") {
          warnings.push(`${where} pays a phone number — phone payouts only work in PayPal production, not the sandbox.`);
        }
      }
    }

    // Same "blank word" handling as recipients, so the literal string "none"
    // from a model doesn't become a condition that blocks payout.
    const condition = isBlankRecipient(p.condition) ? "" : (p.condition ?? "").trim().slice(0, 140);

    clean.push({
      label,
      amount: Number.isFinite(cents) ? cents / 100 : 0,
      note: (p.note ?? "").trim().slice(0, 140) || DEFAULT_PAYOUT_NOTE,
      ...(condition ? { condition } : {}),
      ...(recipient ? { recipient } : {}),
    });
  });

  // The money has to balance: payouts are drawn from what was collected.
  if (goalCents > 0 && sumCents > 0 && sumCents !== goalCents) {
    // A gap of a few cents is almost always rounding in an even split. Steer the
    // model to the right fix: nudge a payout, NEVER the goal the user asked for.
    const looksLikeRounding = Math.abs(sumCents - goalCents) <= Math.max(payouts.length, 3);
    errors.push(
      looksLikeRounding
        ? `payout amounts add up to ${usd(sumCents)} but the goal is ${usd(goalCents)}. This is a rounding difference. Keep the goal at ${usd(goalCents)} and change one payout by the odd ${Math.abs(sumCents - goalCents)} cent(s) so the payouts add up to exactly ${usd(goalCents)}.`
        : `payout amounts add up to ${usd(sumCents)} but the goal is ${usd(goalCents)}. They must match exactly — adjust the payout amounts (or the goal) so the total is the same. Never change an amount the user explicitly stated.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors, ...(fatal ? { fatal: true } : {}) };
  return { ok: true, draft: { name, summary, goal: goalCents / 100, payouts: clean }, warnings };
}
