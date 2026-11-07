// Minimal PayPal REST helpers for the "watch it run" layer.
// Everything degrades to null when credentials are missing or a call fails,
// so callers always fall back to illustrative mock data.

import type { ActivityItem } from "@/data/dashboard";

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

/** Capture an approved PayPal order, settling the payment. */
export async function captureOrder(orderId: string): Promise<{
  ok: boolean;
  status?: number;
  amount: number;
  error?: string;
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
    purchase_units?: Array<{
      payments?: { captures?: Array<{ amount?: { value?: string } }> };
    }>;
  };
  const amount = Number(data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? 0);
  return { ok: true, amount };
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
          sender_item_id: `rivulet-item-${Date.now()}`,
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
