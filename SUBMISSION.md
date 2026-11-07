# Rivulet — Hackathon Submission

---

## Project Name

**Rivulet**

---

## Elevator Pitch

Describe what you want to do with money. Rivulet builds the flow, collects the funds, and pays everyone out — automatically.

---

## Inspiration

Most payment tools are built for one thing: send money to one person. But real life is messier. A band splitting ticket sales. Friends pooling for a trip. A freelancer waiting on three milestone payments. A charity trying to split donations across causes.

The gap between "send $20 to a friend" and "manage a multi-party payment flow" is enormous — and nothing fills it. You either DIY with spreadsheets or pay for enterprise software that takes a week to set up.

We asked: what if you could just *describe* what you want to happen with money — and it happened?

---

## What It Does

**Type it. Build it. Get paid.**

Rivulet turns a plain-English sentence into a complete, live payment flow in seconds.

**→ AI-generated flows**
Tell Rivulet what you need: *"Pay designer@example.com $300 for wireframes and dev@example.com $500 for the build — collect $800 from the client first."* Amazon Bedrock (Nova Lite) designs the payout structure and creates a real PayPal order before you finish reading the result.

**→ Shareable collect pages**
Every flow gets a `/pay/[id]` link. Share it. Each contributor pays their share through PayPal's native checkout — no account needed on their end.

**→ Automatic payouts the moment the goal is hit**
Goal reached? Done. Rivulet instantly fires PayPal Payouts to every recipient. No dashboard. No approval. No waiting. The last contributor sees who got paid right on the payment page.

**→ Send money in seconds**
Skip the flow entirely. Enter an email, an amount, a note. One click. Real PayPal payout. Branded receipt in their inbox.

**→ A dashboard that actually shows your money**
Live stats, a full AG Grid payments ledger sourced from real PayPal transaction history, a flows table with progress bars and status filters, and a People page that knows who paid and who got paid.

---

## How We Built It

**The short version:** Next.js on the outside, PayPal and Bedrock on the inside, AG Grid holding it all together.

**Stack:**
- **Next.js 16** (App Router, TypeScript) — full-stack, single deployment
- **Amazon Bedrock** (`amazon.nova-lite-v1:0`) — AI flow design via `@ai-sdk/amazon-bedrock` and the Vercel AI SDK (`generateText`)
- **PayPal REST APIs** — Orders v2, Payouts v1, Capture, Transaction Reporting
- **PayPal JS SDK** — native checkout buttons on every collect page
- **@paypal/agent-toolkit** — PayPal agentic integration layer
- **AG Grid Community 33.3** — data grids on Flows, Payments, and People pages
- **Resend** — branded transactional email for receipts and invites
- **Zod** — runtime validation of every AI response
- **Tailwind CSS v4** — styling

**The AI pipeline:**
1. User types a prompt → `POST /api/build-flow`
2. Bedrock (`amazon.nova-lite-v1:0`) returns structured JSON: flow name, summary, goal, up to 8 payouts with labels, amounts, states, and recipient emails
3. Zod's `FlowSchema` validates the shape — if the AI hallucinated a bad structure, we catch it before it touches PayPal
4. A real PayPal order is created for the goal amount in the same request, and the approve URL is stored as a `FlowResource`
5. The flow is saved to `flows.json` and the collect link is immediately live
6. If Bedrock is down or rate-limited, a deterministic `mockFlow()` fallback kicks in — the UI never breaks

**The money pipeline:**
- Contributor opens `/pay/[id]` → PayPal JS SDK renders `paypal.Buttons()` with the stored order ID
- Pays via PayPal → `POST /api/capture` settles the order, increments `collected`, and stores payer identity
- If `collected >= goal` → `createPayout()` fires to all recipients in a loop immediately
- If all payouts succeed → flow status flips to `"Paid out"`
- If every payout fails → flow falls to `"Needs approval"` for manual retry via the dashboard

---

## Challenges We Ran Into

**One order, one capture — forever.**
PayPal orders are single-use. Our first build created one order per flow and reused it for every contributor. The second person to pay would hit a 422 from PayPal. We rewired the collect page to create a fresh order per visit via `createOrderForAmount()`. Simple in hindsight, painful to debug in the sandbox.

**The AI doesn't always follow instructions.**
Bedrock sometimes wraps its JSON output in markdown fences despite the system prompt saying not to. We built `stripFences()` and a regex extraction layer so Zod gets clean JSON regardless of what the model wraps it in. Rate limits (`ThrottlingException` / 429) hit without warning — we catch them and return a structured `{ error: "rate_limit", retryAfter }` response so the UI can show a live countdown timer.

**"Who actually paid?"**
Our initial `captureOrder()` only extracted the dollar amount and discarded the rest of the PayPal response. The full capture response has `payer.email_address` and `payer.name` sitting right there. We extended the function to return `payerEmail`, `payerName`, and `payerId`, stored contributors as a structured list, and wired it into the People page so real names appear instead of "Contributor 1."

**Phone payouts in sandbox.**
The PayPal sandbox only accepts `EMAIL` as a `recipient_type` for the Payouts API — `PHONE` is silently rejected. We added an explicit check in `/api/send` that returns a clear 400 error in non-production, so users aren't left wondering why a payout vanished.

**Rename that vanished on refresh.**
Flow renaming worked great — until you refreshed. Local state only. We added `PATCH /api/flows/[id]`, wired both rename inputs to call it, and added a "Saving…" state so users know the name persisted to `flows.json`.

---

## Accomplishments That We're Proud Of

**The full loop runs on real infrastructure.**
Prompt → AI → PayPal order → collect link → contributor pays → funds captured → payouts fire → recipients notified. Every step is real. Nothing is simulated.

**Five PayPal APIs, one coherent experience.**
Orders (create + capture), Payouts, Transaction Reporting, and the JS SDK — most projects touch one. We use all five for distinct purposes that couldn't be swapped. The Transaction Reporting API alone powers the entire Payments ledger with live data.

**AG Grid 33 with real data on three pages.**
Not a demo grid. Every row in Payments is a real PayPal transaction or a real flow capture. Every row in Flows is a live entry in the store. Every person in People is a real payer extracted from a PayPal capture response. Community edition — no Enterprise license needed.

**It degrades gracefully instead of exploding.**
No PayPal creds → clean zero-state dashboard. Bedrock down → mock flow returned. Resend key missing → emails skipped silently. Rate limited → countdown timer. Nothing throws an unhandled 500 at the user.

**Auto-disburse is unconditional.**
The moment the last contribution tips the flow over its goal, `POST /api/capture` fires every payout in the same request — no second action needed from the flow owner. The contributor who pushed it over sees the payout breakdown on the thank-you page.

---

## What We Learned

**PayPal order lifecycle is unforgiving.** One order, one capture, full stop. Designing for multiple contributors means multiple orders — you can't share them.

**Structured AI output needs a safety net.** Even well-instructed models drift. Zod validation after every AI call is non-negotiable. If the schema doesn't parse, you catch it before any money moves.

**AG Grid Community is more powerful than its name suggests.** Custom cell renderers, floating filters, quick search, multi-sort, pagination, and CSV export — all in the Community tier. No Enterprise license needed for a genuinely great data grid.

**The hardest part of payments isn't the API.** It's trust. The UI has to make it obvious where the money is, where it's going, and what happens next — at every step.

**Graceful degradation is a product feature.** Being able to demo the full UI without live credentials — with realistic copy and a coherent flow — meant we could develop and test the entire front-end without spending real money or burning API quota.

---

## What's Next for Rivulet

**Receipt scanning.** Point your phone at a dinner bill. Rivulet reads the line items, suggests a split, and builds the flow. AWS Textract + a vision model call. One feature away from the "split a group dinner" use case being fully real.

**Webhooks instead of polling.** PayPal fires events when captures settle and payouts complete. Replacing the 10-second poll with a real webhook handler (`POST /api/webhooks/paypal`) makes every update instant and eliminates the `flows.json` polling loop.

**Auth and multi-tenancy.** Right now all flows are visible to everyone. Real auth unlocks the Settings page, the People contact book, and the ability to share a flow with specific collaborators — and moves the store from a flat JSON file to a database.

**Choose your contribution amount.** The collect page currently shows the remaining balance as the target amount. True crowd-funding means letting contributors pick any amount and accumulating toward the goal incrementally.

**Multi-currency.** PayPal supports 25+ currencies. The flow builder is one system-prompt change away from handling GBP, EUR, CAD. The payout routes just need `currency_code` parameterized.

**Flow templates as a starting point.** Six built-in templates (Group trip pool, Milestone project, Charity drive, etc.) are already in the UI. Wiring them into the PromptBox so one click pre-fills a prompt is a small step with a big UX payoff.

---

## How This Project Meets the Main Technology Requirement

**PayPal isn't an integration. It's the foundation.**

Every dollar that moves in Rivulet moves through PayPal. No simulated payments. No placeholder transactions. Here's the exact API surface we use:

| API | Endpoint | Purpose |
|---|---|---|
| Orders v2 | `POST /v2/checkout/orders` | Creates a fresh order per contributor when they open a collect page, and at flow creation time |
| Orders v2 | `POST /v2/checkout/orders/{id}/capture` | Settles each contributor's payment, extracts payer identity (email, name, ID) |
| Payouts v1 | `POST /v1/payments/payouts` | Auto-fires simultaneous disbursements to all recipients on goal completion |
| Payouts v1 | `POST /v1/payments/payouts` | Powers the direct Send feature for one-off payments |
| Transaction Reporting | `GET /v1/reporting/transactions` | Drives the live Payments ledger, stat cards, and activity feed |
| PayPal JS SDK | `paypal.Buttons()` | Renders native checkout on every `/pay/[id]` collect page |
| OAuth | `POST /v1/oauth2/token` | Authenticates every server-side call with in-process token caching |

The AI designs the flow. PayPal executes it. They're coupled at the moment of creation — when Bedrock returns the payment plan, PayPal creates the order in the same API call. When the goal is hit, PayPal captures the funds and fires the payouts in the same HTTP round trip. The entire lifecycle — natural-language prompt to money in someone's account — runs on PayPal.
