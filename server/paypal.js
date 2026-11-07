// Minimal PayPal REST helpers used for the "watch it run" layer.
// Everything degrades to null when credentials are missing or a call fails,
// so the UI always falls back to illustrative mock data.

const HOST =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const TOKEN_URL = `${HOST}/v1/oauth2/token`;
const TX_URL = `${HOST}/v1/reporting/transactions`;

let cachedToken = null;
let tokenExpiry = 0;

export function hasPayPalCreds() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function getAccessToken() {
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
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in ?? 30_000) * 1000;
  return cachedToken;
}

/**
 * Fetch recent transactions. Returns null if no creds or on any error so the
 * caller can fall back to mock data.
 */
export async function listTransactions() {
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
    const data = await res.json();
    return data.transaction_details ?? [];
  } catch {
    return null;
  }
}

const moneyFmt = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function timeAgo(iso) {
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

/** Map PayPal transaction records into the ActivityFeed shape. */
export function transactionsToActivity(details) {
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
        time: info.transaction_initiation_date ? timeAgo(info.transaction_initiation_date) : "recently",
        tone: inflow ? "mint" : "ultra",
      };
    })
    .slice(0, 10);
}

/** Derive the two monetary stats from real transactions. */
export function transactionsToStats(details) {
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
