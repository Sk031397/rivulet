// Minimal PayPal REST helpers for the "watch it run" layer.
// Everything degrades to null when credentials are missing or a call fails;
// callers then show what they genuinely have (usually nothing), never invented data.

import type { ActivityItem } from "@/data/dashboard";

import { payoutDue } from "./contribution";

const HOST =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const TOKEN_URL = `${HOST}/v1/oauth2/token`;
const TX_URL = `${HOST}/v1/reporting/transactions`;

let cachedToken: string | null = null;
let tokenExpiry = 0;

export function hasPayPalCreds(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function getAccessToken(): Promise<string | null> {
  if (!hasPayPalCreds()) return null;
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token request failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in ?? 30_000) * 1000;
  return cachedToken;
}

export interface PayPalTransaction {
  transaction_info: {
    /** For a captured checkout payment this equals the capture id. */
    transaction_id?: string;
    transaction_amount?: { value?: string };
    transaction_subject?: string;
    transaction_note?: string;
    transaction_initiation_date?: string;
  };
  payer_info?: { email_address?: string };
}

/** Fetch recent transactions, or null if no creds / on any error. */
export async function listTransactions(): Promise<PayPalTransaction[] | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    const params = new URLSearchParams({
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      page_size: "20",
      fields: "all",
    });

    const res = await fetch(`${TX_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { transaction_details?: PayPalTransaction[] };
    return data.transaction_details ?? [];
  } catch {
    return null;
  }
}

const moneyFmt = (v: string | number): string => {
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return `$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Map PayPal transactions into the ActivityFeed shape. */
export function transactionsToActivity(details: PayPalTransaction[]): ActivityItem[] {
  return (details ?? [])
    .map((t) => {
      const info = t.transaction_info ?? {};
      const amt = Number(info.transaction_amount?.value ?? 0);
      const who = (t.payer_info?.email_address ?? "").split("@")[0] || "Someone";
      const subject = info.transaction_subject || info.transaction_note || "";
      const inflow = amt >= 0;
      const text = subject
        ? `${cap(who)} ${inflow ? "chipped in" : "received a payout of"} ${moneyFmt(amt)} · ${subject}`
        : `${cap(who)} ${inflow ? "chipped in" : "received a payout of"} ${moneyFmt(amt)}`;
      return {
        text,
        time: info.transaction_initiation_date
          ? timeAgo(info.transaction_initiation_date)
          : "recently",
        tone: (inflow ? "mint" : "ultra") as ActivityItem["tone"],
      };
    })
    .slice(0, 10);
}

/** Derive the two monetary stats from real transactions. */
export function transactionsToStats(details: PayPalTransaction[]): {
  collected: number;
  paidOut: number;
  count: number;
} {
  let collected = 0;
  let paidOut = 0;
  let count = 0;
  for (const t of details ?? []) {
    const amt = Number(t.transaction_info?.transaction_amount?.value ?? 0);
    if (amt >= 0) collected += amt;
    else paidOut += Math.abs(amt);
    count += 1;
  }
  return { collected, paidOut, count };
}

/**
 * Read an order's current state without changing it. Used to confirm an order
 * belongs to the flow it claims to (via custom_id) BEFORE capturing any money.
 */
export async function getOrder(orderId: string): Promise<{
  ok: boolean;
  status?: string;
  customId?: string;
  /** The roster member id we attached when the order was created, if any. */
  referenceId?: string;
  amount?: number;
  error?: string;
  /** Present once the order has been captured. */
  captureId?: string;
  captureStatus?: string;
  captureAmount?: number;
  payerEmail?: string;
  payerName?: string;
}> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "no_paypal_creds" };

  const res = await fetch(`${HOST}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  const data = (await res.json()) as {
    status?: string;
    payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
    purchase_units?: Array<{
      custom_id?: string;
      reference_id?: string;
      amount?: { value?: string };
      payments?: { captures?: Array<{ id?: string; status?: string; amount?: { value?: string } }> };
    }>;
  };
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const payerName = [data.payer?.name?.given_name, data.payer?.name?.surname]
    .filter(Boolean).join(" ") || undefined;
  return {
    ok: true,
    status: data.status,
    customId: unit?.custom_id,
    referenceId: unit?.reference_id,
    amount: Number(unit?.amount?.value ?? 0),
    captureId: capture?.id,
    captureStatus: capture?.status,
    captureAmount: capture?.amount?.value !== undefined ? Number(capture.amount.value) : undefined,
    payerEmail: data.payer?.email_address,
    payerName,
  };
}

/** Capture an approved PayPal order, settling the payment. */
export async function captureOrder(orderId: string): Promise<{
  ok: boolean;
  status?: number;
  amount: number;
  error?: string;
  payerEmail?: string;
  payerName?: string;
  payerId?: string;
  /** PayPal's id for the capture itself (unique per payment). */
  captureId?: string;
  /** COMPLETED means the money is settled; anything else (e.g. PENDING) is not yet. */
  captureStatus?: string;
  /** The custom_id we set when creating the order (the flow id). */
  customId?: string;
}> {
  const token = await getAccessToken();
  if (!token) return { ok: false, amount: 0, error: "no_paypal_creds" };

  const res = await fetch(`${HOST}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `rivulet-capture-${Date.now()}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[paypal] capture failed:", err);
    return { ok: false, status: res.status, amount: 0, error: err };
  }

  const data = (await res.json()) as {
    payer?: {
      email_address?: string;
      payer_id?: string;
      name?: { given_name?: string; surname?: string };
    };
    purchase_units?: Array<{
      custom_id?: string;
      payments?: {
        captures?: Array<{ id?: string; status?: string; custom_id?: string; amount?: { value?: string } }>;
      };
    }>;
  };
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amount = Number(capture?.amount?.value ?? 0);
  const payerName = [data.payer?.name?.given_name, data.payer?.name?.surname]
    .filter(Boolean).join(" ") || undefined;
  return {
    ok: true,
    amount,
    payerEmail: data.payer?.email_address,
    payerName,
    payerId: data.payer?.payer_id,
    captureId: capture?.id,
    captureStatus: capture?.status,
    customId: capture?.custom_id ?? unit?.custom_id,
  };
}

/**
 * Create a fresh PayPal order for a specific amount.
 * Used by the per-contributor payment flow so each visitor gets their own order.
 */
export async function createOrderForAmount(
  amount: number,
  description: string,
  /** Stored on the PayPal purchase unit so a capture can be tied back to its flow. */
  customId?: string,
  /** Server-chosen label for who this payment is for (a roster member id). */
  referenceId?: string,
): Promise<{
  ok: boolean;
  orderId?: string;
  approveLink?: string;
  error?: string;
}> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "no_paypal_creds" };

  const res = await fetch(`${HOST}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `rivulet-order-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: amount.toFixed(2) },
        description: description.slice(0, 127),
        ...(customId ? { custom_id: customId.slice(0, 127) } : {}),
        ...(referenceId ? { reference_id: referenceId.slice(0, 127) } : {}),
      }],
      application_context: { brand_name: "Rivulet", user_action: "PAY_NOW" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[paypal] create order failed:", err);
    return { ok: false, error: err };
  }

  const data = (await res.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
  };
  const approveLink =
    data.links?.find((l) => l.rel === "payer-action")?.href ??
    data.links?.find((l) => l.rel === "approve")?.href;

  return { ok: true, orderId: data.id, approveLink };
}

/**
 * Disburse PayPal payouts to all recipients on a flow whose state is not "paid".
 * Returns per-payout results and a suggested final flow status.
 * Used by both /api/capture (auto-disburse on goal completion) and
 * /api/flows/approve (manual approval trigger).
 */
export interface PayoutResult {
  label: string;
  recipient: string;
  amount: number;
  ok: boolean;
  batchId?: string;
  itemStatus?: string;
  error?: string;
}

export async function disburseFlowPayouts(
  flow: {
    name: string;
    payouts: Array<{
      id?: string;
      label: string;
      amount: number;
      state: string;
      recipient?: string;
      condition?: string;
      releaseOn?: string;
    }>;
  },
  /**
   * onlyDue (the automatic path): send just the payouts that are due without a
   * person stepping in. The owner's Approve button passes false and releases all.
   */
  opts: { onlyDue?: boolean } = {},
): Promise<{ results: PayoutResult[]; finalStatus: "Paid out" | "Scheduled" | "Needs approval" }> {
  const results: PayoutResult[] = [];
  const isProduction = process.env.PAYPAL_ENVIRONMENT === "PRODUCTION";

  // Payouts eligible for disbursement: have a recipient, aren't already paid,
  // and (on the automatic path) are actually due.
  const eligible = flow.payouts.filter(
    (p) => p.recipient && p.state !== "paid" && (!opts.onlyDue || payoutDue(p)),
  );

  for (const p of eligible) {
    const recipient = p.recipient!.trim();
    const isEmail = recipient.includes("@");
    const recipientType: "EMAIL" | "PHONE" = isEmail ? "EMAIL" : "PHONE";

    // The PayPal sandbox cannot pay out to a phone number — fail honestly
    // instead of silently skipping (which previously left the payout unpaid
    // while the flow was marked "Paid out").
    if (recipientType === "PHONE" && !isProduction) {
      results.push({
        label: p.label,
        recipient,
        amount: p.amount,
        ok: false,
        error:
          "Phone-number payouts aren't supported in the PayPal sandbox — use an email recipient, or run in production.",
      });
      continue;
    }

    const result = await createPayout({
      recipient,
      recipientType,
      amount: p.amount,
      note: `${flow.name} — ${p.label}`,
      // Lets the payout webhook find this payout again (ids look like "<flow>-p0").
      itemId: p.id,
    });

    results.push({
      label: p.label,
      recipient,
      amount: p.amount,
      ok: result.ok,
      batchId: result.batchId,
      itemStatus: result.itemStatus,
      error: result.error,
    });
  }

  // "Paid out" only when nothing is left unpaid. A payout that is simply waiting
  // for its release date makes the flow "Scheduled"; anything else that is left
  // (a failed send, a missing recipient, a manual condition) needs the owner.
  const sentLabels = new Set(results.filter((r) => r.ok).map((r) => r.label));
  const stillUnpaid = flow.payouts.filter((p) => p.state !== "paid" && !sentLabels.has(p.label));
  const anyFailed = results.some((r) => !r.ok);
  let finalStatus: "Paid out" | "Scheduled" | "Needs approval";
  if (!anyFailed && stillUnpaid.length === 0 && results.length > 0) finalStatus = "Paid out";
  else if (!anyFailed && stillUnpaid.length > 0 && stillUnpaid.every((p) => p.releaseOn && p.recipient)) {
    finalStatus = "Scheduled";
  } else finalStatus = "Needs approval";
  return { results, finalStatus };
}

/**
 * Send a single PayPal payout to a recipient (email, phone, or PayPal ID)
 * via the Payouts API. Note: the PayPal sandbox does NOT support the PHONE
 * recipient type — only EMAIL (and PAYPAL_ID) work there; PHONE works in live.
 */
export async function createPayout(params: {
  recipient: string;
  recipientType: "EMAIL" | "PHONE" | "PAYPAL_ID";
  amount: number;
  note?: string;
  /** Our own id for this payout, echoed back by PayPal in webhooks as sender_item_id. */
  itemId?: string;
}): Promise<{ ok: boolean; status?: number; batchId?: string; itemStatus?: string; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "no_paypal_creds" };

  const res = await fetch(`${HOST}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `rivulet-send-${Date.now()}`,
        email_subject: "You have a payment from Rivulet",
        email_message: "You've received money through Rivulet.",
      },
      items: [
        {
          recipient_type: params.recipientType,
          amount: { value: params.amount.toFixed(2), currency: "USD" },
          note: params.note ? params.note.slice(0, 255) : "Payment from Rivulet",
          sender_item_id: params.itemId ?? `rivulet-item-${Date.now()}`,
          receiver: params.recipient,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[paypal] payout failed:", err);
    return { ok: false, status: res.status, error: err };
  }

  const data = (await res.json()) as {
    batch_header?: { payout_batch_id?: string };
    items?: Array<{ payout_item_id?: string; transaction_status?: string }>;
  };
  const item = data.items?.[0];
  return {
    ok: true,
    batchId: data.batch_header?.payout_batch_id,
    itemStatus: item?.transaction_status,
  };
}

/**
 * Return a captured payment to the contributor in full.
 *
 * The PayPal-Request-Id is derived from the capture id, so calling this twice
 * for the same capture can never refund twice.
 */
export async function refundCapture(captureId: string): Promise<{
  ok: boolean;
  refundId?: string;
  status?: string;
  error?: string;
}> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "no_paypal_creds" };

  const res = await fetch(`${HOST}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `rivulet-refund-${captureId}`,
    },
    body: JSON.stringify({ note_to_payer: "Refund from Rivulet: the group flow did not go ahead." }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Already refunded (e.g. a retry after a timeout) — treat as done.
    if (err.includes("CAPTURE_FULLY_REFUNDED")) return { ok: true, status: "COMPLETED" };
    console.error("[paypal] refund failed:", err);
    return { ok: false, error: err };
  }
  const data = (await res.json()) as { id?: string; status?: string };
  // PENDING refunds still go through; only a CANCELLED/FAILED one does not.
  const failed = data.status === "CANCELLED" || data.status === "FAILED";
  return { ok: !failed, refundId: data.id, status: data.status, error: failed ? `refund ${data.status}` : undefined };
}

/**
 * Check that a webhook call really came from PayPal, using PayPal's own
 * verify-webhook-signature endpoint. Returns false on any problem — including a
 * missing PAYPAL_WEBHOOK_ID — so an unverified call is never acted on.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  event: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const token = await getAccessToken();
  if (!token) return false;

  const h = (name: string) => headers.get(name) ?? "";
  const res = await fetch(`${HOST}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
