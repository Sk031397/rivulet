# Rivulet: demo video script (under 3 minutes, about 2:45)

Hosted demo: https://rivulet-iota.vercel.app (PayPal sandbox)

## 0:00–0:20 Problem (landing page)

> "Whoever books a group trip ends up fronting the money, then chases friends for weeks. Payment apps move money between two people. A trip is many people paying in, several vendors paid out, a deadline, and a way back if it falls apart. This is Rivulet."

On screen: the landing page, then click **Try the demo**.

## 0:20–0:50 Say the trip

> "I describe the trip in one sentence."

Type: *"Lisbon for 4 friends: $1,000 to the villa host and $600 for flights. Me, Sam, Priya and Jo. Everyone pays within 14 days."*

> "An agent on Amazon Bedrock works out each share, the payouts and the deadline. It can look up contacts and check recipients, but it can't move money. The rules are enforced in code."

On screen: click **Build flow** and show the plan.

## 0:50–1:10 Invoice shortcut

> "Or I attach a booking invoice."

On screen: attach `demo/invoice-sea-breeze-usd.pdf`. The payee (Sea Breeze Rentals LLC), the $1,600 total and the due date are read, and the flow is built automatically.

> "The AI can misread an email address. If it looks like one I already pay, Rivulet uses the address I know. Any new address waits for my approval: it's never paid automatically."

## 1:10–1:50 Friends pay with PayPal

> "Each friend opens one link, picks their name, and pays their share through PayPal. No account on our side."

On screen: open the pay page, pay one share in the sandbox, and show the roster updating (who has paid, who still owes).

## 1:50–2:25 Payout

> "When the pot is full, Rivulet sends the PayPal payouts. A signed webhook confirms each one."

On screen: fill the remaining shares, show the flow flip to **Paid out**, and show the Payments page.

## 2:25–2:45 Safety and refund

> "Capture is idempotent. A payout lock stops double payouts. If the trip is cancelled, one click refunds everyone, and refunds are refused once a payout has been sent."

On screen: refund a second test flow and show **Refunded**.

## 2:45–3:00 Close

> "Rivulet: say the trip, and it gets paid for. Built with Next.js, PayPal Orders, Payouts, Refunds and Webhooks, and Amazon Bedrock. It runs in the PayPal sandbox."

---

## Before you record

- Do a dry run first, so the sandbox buyer login and the payout recipient are ready.
- The sample flow's payout recipients are fake `example.com` addresses. Use your own flow with a real sandbox recipient for the payout scene.
- Say "sandbox" on camera.
- Don't use copyrighted music.
- Show it running in a browser on your own machine, and mention the hosted URL.
- Upload to YouTube as public, and paste the link into the Devpost form.
