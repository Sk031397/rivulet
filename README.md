# Rivulet

> Describe what you want to do with money. Rivulet builds the flow, collects the funds, and pays everyone out — automatically.

A full-stack Next.js 16 app built for the PayPal hackathon. Type a plain-English goal, Amazon Bedrock designs the payout structure, PayPal creates a live order, and a shareable collect page goes live in seconds. When the goal is met, payouts fire automatically — no dashboard, no approval, no waiting.

---

## Quick start

```bash
npm install
npm run dev       # dev server at http://localhost:3000
npm run build     # production build → /.next
npm run start     # serve production build (honours PORT env var)
npm run lint      # TypeScript type-check
```

---

## Configuration

Copy `.env.example` to `.env` and fill in the values you need.

| Variable | Required? | Description |
|---|---|---|
| `PAYPAL_CLIENT_ID` | For live payments | PayPal REST API client ID (sandbox or production) |
| `PAYPAL_CLIENT_SECRET` | For live payments | PayPal REST API client secret |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | For collect pages | PayPal JS SDK client ID (exposed to the browser for `/pay/[id]`) |
| `PAYPAL_ENVIRONMENT` | No | `SANDBOX` (default) or `PRODUCTION` |
| `AWS_REGION` | For AI flow builder | AWS region for Amazon Bedrock (default `us-east-1`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | For AI flow builder | AWS credentials (or use `~/.aws/credentials`, IAM role, etc.) |
| `RESEND_API_KEY` | For email | Resend API key for transactional receipts and invites |
| `RESEND_FROM` | For email | Sender address (e.g. `payments@yourdomain.com`) |

**Running without credentials:**
- No PayPal creds → the dashboard shows zeros, stat cards show sample copy, no real payments are made.
- No AWS creds → the AI flow builder falls back to a deterministic `mockFlow()` — the UI never breaks.
- No Resend key → emails are skipped silently; payment operations are unaffected.

---

## How it works

```
User types a prompt
       ↓
POST /api/build-flow
       ↓
Amazon Bedrock (Nova Lite) → structured JSON flow plan
       ↓                       (Zod-validated)
PayPal Orders API → real sandbox order created
       ↓
Flow saved to flows.json, /pay/[id] goes live
       ↓
Contributor opens /pay/[id] → PayPal JS SDK renders checkout
       ↓
POST /api/capture → order settled, collected amount updated
       ↓
  collected >= goal?
  YES → PayPal Payouts API fires to all recipients automatically
  NO  → stay in "Collecting" state
```

---

## PayPal API surface

| API | Endpoint | Purpose |
|---|---|---|
| Orders v2 | `POST /v2/checkout/orders` | Fresh order per contributor and per flow creation |
| Orders v2 | `POST /v2/checkout/orders/{id}/capture` | Settle payment, extract payer identity |
| Payouts v1 | `POST /v1/payments/payouts` | Auto-disburse on goal completion; direct Send payments |
| Transaction Reporting | `GET /v1/reporting/transactions` | Powers the Payments ledger, stat cards, and activity feed |
| PayPal JS SDK | `paypal.Buttons()` | Native checkout on every `/pay/[id]` collect page |
| OAuth | `POST /v1/oauth2/token` | Authenticates all server-side calls (token cached in-process) |

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                  Landing page (Hero, Features, UseCases, HowItWorks)
│   ├── dashboard/
│   │   ├── page.tsx              Overview: PromptBox, FlowList, StatCards, ActivityFeed
│   │   ├── flows/page.tsx        AG Grid flows table with FlowPanel slide-over
│   │   ├── payments/page.tsx     AG Grid unified payment history + CSV export
│   │   ├── send/page.tsx         Direct one-off PayPal payout form
│   │   ├── people/page.tsx       Contributors and recipients from real captures
│   │   ├── templates/page.tsx    Six pre-built flow templates
│   │   └── settings/page.tsx     App settings
│   ├── pay/[id]/page.tsx         Public contributor collect page (PayPal JS SDK)
│   └── api/
│       ├── build-flow/           POST — AI flow builder (Bedrock → PayPal order)
│       ├── flows/                GET — list all flows
│       ├── flows/[id]/           PATCH (rename) / DELETE
│       ├── flows/approve/        POST — manual payout approval
│       ├── capture/              POST — capture PayPal order, auto-disburse if goal met
│       ├── send/                 POST — direct one-off PayPal payout
│       ├── payments/             GET — unified payment history
│       ├── activity/             GET — live activity feed from PayPal transactions
│       ├── stats/                GET — four stat cards (balance, collected, paid out, flows)
│       └── invite/               POST — send branded invite email via Resend
├── components/
│   ├── dashboard/                Sidebar, PageHeader, StatCards, FlowList, FlowDetail,
│   │                             FlowPanel, PromptBox, ActivityFeed, StatusPill, MobileNav
│   └── (landing sections)        Hero, Features, UseCases, HowItWorks, CTA
├── data/
│   ├── content.ts                Brand, nav, features, use cases, how-it-works copy
│   └── dashboard.ts              TypeScript interfaces + sidebar/template/suggestion copy
└── lib/
    ├── flow.ts                   Zod schema (FlowSchema) + toDashboardFlow + mockFlow
    ├── paypal.ts                 All PayPal REST helpers (OAuth, Orders, Payouts, Reporting)
    ├── store.ts                  File-backed flow store (reads/writes flows.json)
    ├── email.ts                  Resend transactional email templates
    └── mock.ts                   Fallback data for when credentials are absent

flows.json                        Persistent flow store (created automatically on first build)
```

---

## Tech stack

| Technology | Version | Role |
|---|---|---|
| Next.js | ^16.4.5 | Full-stack framework (App Router, TypeScript) |
| React | ^19.0.0 | UI |
| Tailwind CSS | ^4.3.5 | Styling |
| Amazon Bedrock (Nova Lite) | `amazon.nova-lite-v1:0` | AI flow designer |
| Vercel AI SDK | ^7.0.164 | Bedrock integration (`generateText`) |
| @ai-sdk/amazon-bedrock | ^5.0.134 | Bedrock provider |
| @aws-sdk/credential-providers | ^3.1164.0 | AWS credential chain |
| PayPal JS SDK | CDN | Browser checkout buttons |
| @paypal/agent-toolkit | ^1.11.0 | PayPal agentic integration |
| AG Grid Community | 33.3.0 | Data grids (Flows, Payments, People) |
| Resend | ^6.37.0 | Transactional email |
| Zod | ^4.6.7 | Runtime validation of AI output |
| lucide-react | ^1.70.0 | Icons |

---

## Renaming the brand

Edit `BRAND` in `src/data/content.ts` and the `title` in `src/app/layout.tsx` metadata.

---

> **Note:** this project was migrated from an earlier Vite build. The original Vite source (hash-routed pages, `useHashRoute`, `.jsx`/`.js` modules) has been moved to `.vite-legacy/` for reference and is not part of the build.
