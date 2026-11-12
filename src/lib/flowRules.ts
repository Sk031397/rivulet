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

/**
 * Collapse characters a vision model confuses when reading an address:
 * l / 1 / i / | look alike, and so do o / 0.
 */
function confusableKey(address: string): string {
  return address.trim().toLowerCase().replace(/[1i|]/g, "l").replace(/0/g, "o");
}

/**
 * If `read` (an address the AI read off a document) is not one of the user's
 * known addresses but is a look-alike of exactly one of them, return that known
 * address. Otherwise null: an exact match needs no fix, and two look-alikes are
 * ambiguous, so neither is guessed.
 */
export function matchKnownAddress(read: string, known: Contact[]): string | null {
  const r = read.trim().toLowerCase();
  if (!r) return null;
  if (known.some((c) => c.address.trim().toLowerCase() === r)) return null;
  const key = confusableKey(r);
  const hits = new Set(
    known.filter((c) => confusableKey(c.address) === key).map((c) => c.address.trim().toLowerCase()),
  );
  return hits.size === 1 ? [...hits][0] : null;
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
  releaseOn?: string | null;
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
  payouts: Array<{
    label: string;
    amount: number;
    note: string;
    condition?: string;
    recipient?: string;
    releaseOn?: string;
  }>;
}

/** Why a release date can't be used, or null if it's fine (a real date, today or later, within 2 years). */
function releaseDateProblem(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "releaseOn must be a date written YYYY-MM-DD.";
  const t = Date.parse(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== raw) return "releaseOn must be a real calendar date.";
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (t < today) return "releaseOn is in the past — omit it or choose today or a later date.";
  if (t - today > 2 * 366 * 86_400_000) return "releaseOn is more than two years away.";
  return null;
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
    else if (isContributorLabel(label)) {
      errors.push(
        `${where} names a contributor. Payouts are the people or businesses RECEIVING the money (the villa host, the airline, the restaurant) — not the people paying in. Use one payout per payee the user named.`,
      );
    } else if (seenLabels.has(label.toLowerCase())) errors.push(`payout labels must be unique ("${label}" is repeated).`);
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

    // A release date makes the condition automatic: the app can check a date itself.
    // If the model wrote the date into the condition or note instead of releaseOn,
    // promote it (the agent still checks the date came from the user's request).
    let releaseOn: string | undefined;
    if (!isBlankRecipient(p.releaseOn)) {
      const raw = String(p.releaseOn).trim();
      const problem = releaseDateProblem(raw);
      if (problem) errors.push(`${where}: ${problem}`);
      else releaseOn = raw;
    } else {
      const found = datesInText(`${condition} ${p.note ?? ""}`).find((d) => releaseDateProblem(d) === null);
      if (found) releaseOn = found;
    }

    clean.push({
      label,
      amount: Number.isFinite(cents) ? cents / 100 : 0,
      note: (p.note ?? "").trim().slice(0, 140) || DEFAULT_PAYOUT_NOTE,
      ...(releaseOn ? { condition: condition || `Released on ${releaseOn}`, releaseOn } : condition ? { condition } : {}),
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

/* ─── dates the user typed ───────────────────────────────────────────── */

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const NAMED_DATE = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`, "i");

/**
 * Computed in code: if the user typed a date, make sure the flow actually has a
 * deadline or a scheduled payout for it. A small model can quietly drop a date
 * (or say it scheduled something it didn't), so we say so instead.
 */
export function dateWarnings(
  prompt: string,
  flow: { deadline?: string; payouts: Array<{ label: string; releaseOn?: string; condition?: string }> },
): string[] {
  const out: string[] = [];
  const used = new Set<string>([flow.deadline, ...flow.payouts.map((p) => p.releaseOn)].filter((d): d is string => !!d));
  const today = new Date().toISOString().slice(0, 10);

  // The user asked for money to be held until something happens, but nothing is.
  if (conditionRequested(prompt) && !flow.payouts.some((p) => p.condition || p.releaseOn)) {
    out.push(
      "Your request suggests some money should wait for something to happen, but no payout has a release condition. As built, every payout is sent as soon as the goal is met.",
    );
  }

  for (const iso of new Set(prompt.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])) {
    if (used.has(iso)) continue;
    out.push(
      iso < today
        ? `You mentioned ${iso}, which has already passed, so nothing is scheduled for it.`
        : `You mentioned ${iso}, but no payout or deadline in this flow uses that date. Check the flow before sharing it.`,
    );
  }

  // A date written out ("March 3"): we can't always tell if it was a deadline or a
  // payout date, so only flag the case where the flow has no date at all.
  if (out.length === 0 && NAMED_DATE.test(prompt) && used.size === 0) {
    out.push("You mentioned a date, but this flow has no deadline or scheduled payout. Check whether you need one.");
  }
  return out;
}

/* ─── keeping the model to what the user actually said ───────────────── */

const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Month/day pairs written out in the prompt ("March 3", "3rd of March"). */
function namedDatesIn(prompt: string): Array<{ month: number; day: number }> {
  const out: Array<{ month: number; day: number }> = [];
  const m = `(${MONTHS})`;
  const monthFirst = new RegExp(`\\b${m}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi");
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${m}\\b`, "gi");
  for (const x of prompt.matchAll(monthFirst)) out.push({ month: MONTH_NUM[x[1].slice(0, 3).toLowerCase()], day: Number(x[2]) });
  for (const x of prompt.matchAll(dayFirst)) out.push({ month: MONTH_NUM[x[2].slice(0, 3).toLowerCase()], day: Number(x[1]) });
  return out;
}

const DAY_NAME = "(?:mon|tues|wednes|thurs|fri|satur|sun)day";
const COUNT = "(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const RELATIVE_TIME = new RegExp(
  [
    "\\b(?:today|tomorrow|tonight)\\b",
    `\\b(?:this|next)\\s+(?:week|weekend|month|year|${DAY_NAME})\\b`,
    `\\b(?:within|in|after|before)\\s+${COUNT}\\s+(?:days?|weeks?|months?)\\b`,
    `\\b${COUNT}\\s+(?:days?|weeks?|months?)\\s+(?:from now|before|after|later)\\b`,
    `\\bby\\s+(?:the\\s+)?(?:${DAY_NAME}|weekend|end of)\\b`,
    "\\bend of (?:the )?(?:week|month|year)\\b",
  ].join("|"),
  "i",
);

/**
 * Whether a date the model chose can be traced back to what the user wrote: the
 * same ISO date, the same month and day written out, or a relative phrase ("in
 * two weeks", "by Friday") that we can't check precisely but that is theirs.
 * Stops the model from inventing a deadline or a payout date.
 */
export function dateGrounded(prompt: string, iso: string): boolean {
  if (prompt.includes(iso)) return true;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (namedDatesIn(prompt).some((d) => d.month === month && d.day === day)) return true;
  return RELATIVE_TIME.test(prompt);
}

/** Whether the request says money should wait for something to happen. */
export function conditionRequested(prompt: string): boolean {
  return /\b(once|after|when|whenever|until|upon|unless|verif\w*|confirm\w*|approv\w*|released?|only if|provided)\b/i.test(prompt);
}

/**
 * The group size the user stated ("6 people", "for 8 friends", "5 of us", "me and
 * 2 friends"), or null. Read in code because the model sometimes skips it.
 */
export function groupSizeFromPrompt(prompt: string): number | null {
  // "me and 2 friends" is 3 people, so check that form before the general one.
  const meAnd = /\b(?:me|myself|i)\s+and\s+(\d{1,3})\s+(?:other\s+)?(?:friends?|people|others?)\b/i.exec(prompt);
  if (meAnd) return Number(meAnd[1]) + 1;
  const direct = /\b(\d{1,3})\s+(?:people|persons|friends|guys|adults|of us|travell?ers|members)\b/i.exec(prompt);
  if (direct) return Number(direct[1]);
  return null;
}

/** Labels that name a contributor, not who gets paid ("Person 1", "Friend 2"). */
export function isContributorLabel(label: string): boolean {
  return /^(person|participant|member|contributor|friend|payee|recipient|guest|attendee)\s*#?\s*\d+$/i.test(label.trim());
}

/** A written-out month and day as the next YYYY-MM-DD on or after today, or null if not a real date. */
function resolveNamedDate(d: { month: number; day: number }, now: Date = new Date()): string | null {
  const today = now.toISOString().slice(0, 10);
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const iso = `${year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    const t = Date.parse(`${iso}T00:00:00.000Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null;
    if (iso >= today) return iso;
  }
  return null;
}

/** Every date written in the text: ISO dates as-is, written-out dates as their next occurrence. */
export function datesInText(text: string): string[] {
  const out = new Set<string>(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
  for (const d of namedDatesIn(text)) {
    const iso = resolveNamedDate(d);
    if (iso) out.add(iso);
  }
  return [...out];
}

/**
 * A payment deadline the user stated outright ("pay by December 5", "before
 * 2026-12-05"), or null. Read in code because the model sometimes skips it.
 * Only "by / before / until / no later than" count, so a payout date ("pay the
 * host on March 3") is never mistaken for a deadline.
 */
export function deadlineFromPrompt(prompt: string): string | null {
  const m = new RegExp(
    `\\b(?:by|before|until|no later than)\\s+((?:\\d{4}-\\d{2}-\\d{2})|(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS}))\\b`,
    "i",
  ).exec(prompt);
  if (!m) return null;
  return datesInText(m[1])[0] ?? null;
}

/* ─── currency the user wrote ────────────────────────────────────────── */

export type FlowCurrency = "USD" | "EUR" | "GBP" | "CAD" | "AUD";

/**
 * The currency a request is written in: "EUR" for "€1,800" or "1800 euros", and
 * so on. Null when nothing is named (the flow is then USD). "MIXED" if it names
 * more than one non-dollar currency. Read in code, not left to the model.
 */
export function currencyFromPrompt(prompt: string): FlowCurrency | "MIXED" | null {
  const found = new Set<FlowCurrency>();
  if (/€|\beur\b|\beuros?\b/i.test(prompt)) found.add("EUR");
  if (/£|\bgbp\b|\bpounds?\b|\bsterling\b/i.test(prompt)) found.add("GBP");
  if (/\bcad\b|\bc\$|\bca\$|\bcanadian\s+dollars?\b/i.test(prompt)) found.add("CAD");
  if (/\baud\b|\ba\$|\bau\$|\baustralian\s+dollars?\b/i.test(prompt)) found.add("AUD");
  if (found.size > 1) return "MIXED";
  if (found.size === 1) return [...found][0];
  return null;
}
