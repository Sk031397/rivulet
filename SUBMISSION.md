# Rivulet — Hackathon Submission

**Live demo:** https://rivulet-iota.vercel.app (PayPal sandbox)

---

## Project Name

**Rivulet**

## Tagline

**Say the trip. Rivulet pays for it.**

## Elevator Pitch

The group trip, paid for. Describe the trip in one sentence; Rivulet collects everyone's share through PayPal, pays the villa, flights and dinner when the pot is full, and refunds everyone if the trip falls through.

---

## Inspiration

Whoever books a group trip usually ends up fronting the money, then spends weeks chasing friends for their share. Payment apps move money between two people. Nothing handles the real shape of a trip: many people paying in, several vendors paid out, a deadline, and a way back if it falls apart.

## What It Does

**Say the trip.** Type something like *"Lisbon for 4 friends: $1,000 to the villa host and $600 for flights. Everyone pays within 14 days."* An AI agent on Amazon Bedrock works out the total, each person's share, the payouts and the deadline.

**One link.** Friends open a pay page that shows their share, how many shares are covered, and the days left. They pay with PayPal; no account on our side.

**See who's in.** Name the people ("me, Sam, Priya and Jo") and the organizer sees exactly who has paid and who still owes, with reminder emails or a ready-made message for the group chat. Friends pick their name on the pay page, so each payment is tied to a person.

**Roster, re-split and invoices.** Name the group and the organizer sees who has paid and who owes, with reminders. When someone drops out, a preview shows two outcomes (others cover it, or the cost drops with them and the payouts scale down to the cent). Attach a booking invoice and the app reads the payee, email, total, currency and due date into the prompt for you to check. Flows can be in USD, EUR, GBP, CAD or AUD.

**Pay the vendors.** When the pot is full, Rivulet sends the PayPal payouts. A payout can also be scheduled for a date ("pay the villa host on March 3") and is released automatically that day. A signed PayPal webhook confirms each payout, and also catches a payment that is later refunded, reversed or disputed, so the pot never silently shrinks. If a payout fails, is returned, or sits unclaimed, the flow is flagged so the organizer can fix the recipient and retry.

**Money back.** If the trip is cancelled the organizer can refund everyone with one click, and a daily job refunds flows that miss their deadline. Refunds are refused once any payout has been sent.

Also: a direct Send page, editable payouts in an AG Grid table (undo/redo, validation), a Payments ledger from PayPal transaction history, and an analytics overview.

---

## How We Built It

- **Next.js 16** (App Router, TypeScript), **Clerk** for sign-in, **Postgres** (Supabase) for storage, deployed on **Vercel**.
- **Amazon Bedrock (Nova Lite)** through the Vercel AI SDK, as a **tool-calling agent**: `find_contacts`, `check_recipient`, `create_flow`. The agent can look up the user's contacts and validate payout destinations, but it cannot move money.
- **Guard rails live in code, not the prompt.** Amounts must sum to the goal to the cent, recipients are validated, a payout can't be created as already paid, and payouts must name who *receives* money, not the contributors. Running the agent against live Bedrock showed a small model will invent a deadline, a payout date, group members or a release condition, so every one of those must trace back to the user's own words, checked in code. A date the user typed that didn't make it into the flow, or a "pay once…" that became an immediate payout, is reported as a warning instead of passing silently.
- **Tested.** `npm test` runs 62 unit tests over the money rules (idempotent capture, one-time payout trigger, deadlines, refunds, shares, roster, re-split arithmetic, scheduled release, reversed payments, currency formatting), the invoice reader's handling of untrusted model output, and the AI guard rails.
- **AG Grid Community 33.3** for the Flows, Payments, People and payouts tables, with a shared theme, live updates, pinned totals, and date sort/filter.

### PayPal Developer Platform

| API | Used for |
|---|---|
| Orders v2 (create, get, capture) | A separate order per contributor, tagged with the flow id and verified at capture |
| Payouts v1 | Paying vendors when the goal is met |
| Payments v2 refunds | Returning each payment in full; the request id is derived from the capture id so a retry can't refund twice |
| Webhooks | Signature-verified payout confirmations and failure handling, plus refunded, reversed and disputed payments |
| Transaction Reporting | Payments ledger and activity feed |
| JavaScript SDK | Checkout on the pay page |

### Making the money safe

Many people paying into one flow at once is the hard part:
- Capture is idempotent on PayPal's capture id.
- An order that no longer fits (flow filled, or deadline passed) is refused before the contributor is charged.
- Updates run in row-locked transactions, and a payout lock prevents two payout runs, or a payout and a refund, on the same flow.
- Public pages expose only a whitelist of flow data: no owner id, no recipient addresses.

---

## Challenges We Ran Into

- **One order, one capture.** PayPal orders are single-use, so every contributor gets their own order, and capture verifies it belongs to the flow.
- **Concurrent payers.** Two people can approve orders that individually fit but together don't. We recheck at capture and leave the second order uncaptured.
- **Keeping the AI honest.** A small model drifts. Moving the rules into code and returning their errors to the model made it reliable without making it trusted.
- **Knowing a payout really landed.** Sending a payout isn't the same as the recipient getting it. Payouts carry their own id so the webhook can match PayPal's later events back to the right payout.
- **Shipping it.** Hosting-specific problems: deployment protection blocking PayPal's webhook calls, per-deployment URLs versus the production domain, and AWS credentials that don't exist on a serverless host.

## Accomplishments

- A complete, tested loop on the live site: AI plan → contributor pays → payout → webhook confirms (`SUCCESS`) → separate refund test, which recorded a real PayPal refund id and reset the flow to Refunded.
- No mock data in the product. Every figure on a page comes from a real flow or PayPal transaction.
- The agent was run against live Bedrock on a 29-case suite during development, scoring 26–29 of 29 across runs.

## What We Learned

Payments are mostly about trust and edge cases, not API calls. The interesting work was deciding what must never happen (double payout, charging an order that doesn't fit, refunding after payout) and making the code, not the AI, enforce it.

## What's Next

- Real verification for manual release conditions ("pay the venue after the event") instead of holding for owner approval.
- Production PayPal accounts, and phone-number payouts (production only).
- Receipt scanning to split a dinner bill.
- Multi-currency.

---

## Honest limits

- Everything runs in the **PayPal sandbox**.
- A release condition like "after the event" holds a flow for the organizer's approval; it is not verified automatically. A release *date* is paid automatically.
- Reminder emails need an email provider to be configured; otherwise the organizer copies the message into the group chat.
- Money in other currencies is correct on each flow and its pay page, but the overview, ledger and activity feed total US-dollar activity only. Non-USD flows have not been paid end to end in the sandbox, and whether a sandbox account accepts a currency depends on its settings.
- Invoice reading takes images (PNG, JPEG, WebP), not PDFs, and always shows the organizer what it read before anything is built.
- The daily job (deadline refunds and scheduled payouts) is deployed but has not yet been observed running. The routines it calls are the same ones the owner's buttons use, and the refund routine was tested with a real sandbox payment.
- The webhook handlers for refunded, reversed and disputed payments have not been triggered by a real PayPal event. The money rules they rely on (what counts as collected, who has paid) are unit-tested; the handlers themselves are not.
