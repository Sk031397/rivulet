# Rivulet

> The group trip, paid for.

Whoever books a group trip usually fronts the money and then chases friends for their share. Rivulet fixes that. Describe the trip in one sentence; an AI agent builds the plan (each person's share, who gets paid, the deadline). Friends pay through PayPal using one link. When the pot is full the vendors are paid automatically, and PayPal's webhook confirms every payout. If the trip falls through or the deadline passes, everyone is refunded.

Everything runs against the **PayPal sandbox**. No real money moves.

---

## Quick start

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run start     # serve the production build
npm run lint      # TypeScript type-check (tsc --noEmit)
npm test          # unit tests for the money rules and the AI guard rails (node:test, no extra dependencies)
```

---

## Configuration

Create a `.env` file in the project root.

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Postgres connection string. For Supabase use the pooler (port 6543). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in | From your Clerk dashboard. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Payments, payouts, refunds | Sandbox REST app credentials. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Pay page checkout | Same client id, exposed to the browser. |
| `PAYPAL_ENVIRONMENT` | Optional | `PRODUCTION` for live; anything else uses the sandbox. |
| `PAYPAL_WEBHOOK_ID` | Payout confirmation | Id of the webhook you create in the PayPal dashboard. Without it every webhook call is rejected. |
| `CRON_SECRET` | Deadline refunds | Any long random string. The daily job refuses to run without it. |
| `BEDROCK_API_KEY` | AI flow builder (hosted) | Simplest option on Vercel. |
| `BEDROCK_ACCESS_KEY_ID`, `BEDROCK_SECRET_ACCESS_KEY`, `BEDROCK_SESSION_TOKEN` | AI flow builder (hosted) | Alternative to the API key. Vercel reserves the plain `AWS_*` names. |
| `BEDROCK_REGION`, `BEDROCK_MODEL_ID` | Optional | Default `us-east-1` and `amazon.nova-lite-v1:0`. |
| `RESEND_API_KEY`, `RESEND_FROM` | Optional | Receipt and invite emails. Skipped silently when unset. |

Locally, Bedrock credentials come from the normal AWS chain (`~/.aws`, SSO, …) when none of the `BEDROCK_*` keys are set.

**PayPal webhook:** in the PayPal developer dashboard add a webhook to your sandbox app pointing at `https://<your-domain>/api/webhooks/paypal` and copy its id into `PAYPAL_WEBHOOK_ID`. Subscribe it to:

- `PAYMENT.PAYOUTS-ITEM.*` — payout succeeded, failed, returned, blocked, held or unclaimed
- `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.CAPTURE.DENIED` — a payment taken back after the fact
- `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED` — a payer disputes a payment

Use a stable production domain, not a per-deployment Vercel URL.

---

## How it works

```
"Lisbon for 4 friends: $1,000 villa, $600 flights, pay by March 1"
        ↓  POST /api/build-flow
Bedrock agent (tools: find_contacts, check_recipient, create_flow)
        ↓  rules enforced in code, not in the prompt
Flow saved (owner-scoped Postgres row) → /pay/[id] is live
        ↓
Each contributor: POST /api/orders (their own PayPal order)
        ↓  approve in PayPal
POST /api/capture → verified, recorded idempotently
        ↓
Goal reached?  manual condition ("after the event") → held for the owner to approve
               release date ("on March 3")        → paid automatically that day (daily cron)
               otherwise                          → paid now
        ↓
PayPal → POST /api/webhooks/paypal (signature verified)
        → payout confirmed, or flagged if it failed / was returned / unclaimed
        → a payment refunded, reversed or disputed afterwards is taken out of the pot and flagged

Trip cancelled or deadline missed → refund every payment (owner button or daily cron)
```

**Roster.** If you name the people ("me, Sam, Priya and Jo") the flow gets a roster. Friends pick their name on the pay page, the owner sees who has paid and who owes what, and can email reminders (needs `RESEND_API_KEY`) or copy a message for the group chat. Paid status is derived from the real payments, never stored separately.

**Someone drops out.** Removing a person who hasn't paid offers two outcomes, each previewed first: *others cover it* (the cost stays and each share rises) or *the cost drops with them* (the goal and every payout are scaled down together, to the cent). It refuses if a payout was already sent or people have already paid more than the new total. The result comes with a message to paste into the group chat.

**Invoices.** "Attach an invoice" reads a PNG, JPEG or WebP of a booking confirmation (payee, email, total, currency, due date, line items) with the same Bedrock model. The reply is treated as untrusted: amounts must be sane, the name is scrubbed, the email must validate, the date must be real. It fills the prompt box with a one-line sentence for you to check and edit; the document's own text is never given to the flow agent.

**Currency.** A flow can be in USD, EUR, GBP, CAD or AUD, taken from what you write (`€1,800`, `£500`, `400 CAD`). Orders, the PayPal checkout button, payouts and every amount shown use that currency; flows without one are USD. A request that mixes currencies is refused rather than guessed.

## PayPal APIs used

| API | Used for |
|---|---|
| Orders v2 (create, get, capture) | One order per contributor, tagged with the flow id and checked at capture |
| Payouts v1 | Paying vendors when the goal is met; the direct Send page |
| Payments v2 refunds | Returning each contributor's payment in full (idempotent per capture) |
| Webhooks (`verify-webhook-signature`) | Confirming payout outcomes |
| Transaction Reporting | The Payments ledger, stat cards and activity feed |
| JavaScript SDK | Checkout buttons on the pay page |
| OAuth 2.0 | Server-side auth with an in-process token cache |

## Money safety

- Owner routes require a Clerk session and only touch that owner's flows. Contributor routes (`/api/orders`, `/api/capture`, `GET /api/flows/[id]`) are public by design and only expose a whitelist (`toPublicFlow`): no owner id, no recipient addresses.
- Capture checks the order belongs to the flow, is idempotent on PayPal's capture id, and refuses to charge an order that no longer fits (flow filled, or deadline passed).
- Updates run in row-locked transactions. A payout lock stops two payout runs, or a payout and a refund, on the same flow.
- Refunds are refused once any payout has been sent.
- Payouts carry their own id (`sender_item_id`) so the webhook can find them again.
- The AI cannot invent a deadline, a payout date, a group member or a release condition: each must trace back to the user's own words, checked in code, and a date the user typed that didn't make it into the flow is reported back as a warning.

## Project structure

```
src/
├── app/
│   ├── page.tsx                 Landing page
│   ├── pay/[id]/                Public contributor page (share, deadline, PayPal checkout)
│   ├── dashboard/               Overview, Send, Flows, Payments, People, Templates, Settings
│   └── api/
│       ├── build-flow/          AI agent
│       ├── read-invoice/        Reads an attached invoice image into a draft sentence
│       ├── orders/  capture/    Contributor payments (public)
│       ├── flows/               List, edit, delete; approve/ and refund/ for the owner
│       ├── webhooks/paypal/     Signed payout confirmations
│       ├── cron/expire/         Daily refund of flows past their deadline
│       ├── send/  invite/       Direct payout and invite email
│       └── payments/ activity/ stats/   Reporting
├── components/                  Landing sections and dashboard UI (AG Grid tables, TripControls)
├── data/                        Types, templates and landing copy
└── lib/
    ├── agent.ts  flowRules.ts   Tool-calling agent and its code-level guard rails
    ├── invoice.ts  bedrock.ts   Invoice reader and the shared Bedrock client
    ├── contribution.ts          Shared rules: shares, deadlines, refund eligibility
    ├── paypal.ts  refund.ts  release.ts   PayPal calls; the refund and scheduled-payout routines
    ├── store.ts  db.ts          Postgres store (owner-scoped, row-locked updates)
    └── publicFlow.ts            What anonymous contributors may see
tests/                           Unit tests (npm test)
vercel.json                      Daily cron: deadline refunds and scheduled payouts
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Clerk · Postgres (`postgres` driver, Supabase) · Amazon Bedrock (Nova Lite) via the Vercel AI SDK · AG Grid Community 33.3 · Zod · Resend.

## Known limits

- Sandbox only. Phone-number payouts work only in PayPal production.
- A *manual* release condition ("after the event") holds the flow for the owner's approval; nothing verifies it automatically. A release *date* is paid automatically.
- Reminder emails need an email provider (`RESEND_API_KEY`); without one, use the copy-message button.
- Money in other currencies is shown correctly on each flow and its pay page, but the overview, Payments ledger and activity feed add amounts together, so they count US-dollar activity only.
- Non-USD flows have not been paid end to end in the PayPal sandbox. Whether a sandbox account accepts a given currency depends on its settings.
- Invoice reading takes images only (PNG, JPEG, WebP), not PDFs, and is checked by you before anything is built.
- The daily job (deadline refunds and scheduled payouts) has not been observed running on Vercel; the routines it calls are the same ones used by the owner's buttons.
- The webhook handlers for refunded, reversed and disputed payments have not been triggered by a real PayPal event. The money rules they rely on (what counts as collected, who has paid) are unit-tested; the handlers themselves are not.

## Renaming the brand

Edit `BRAND` in `src/data/content.ts` and the metadata title in `src/app/layout.tsx`.
