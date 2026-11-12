# Rivulet: architecture and design

Diagrams are [Mermaid](https://mermaid.js.org); GitHub renders them in the browser. PNG exports are in `docs/` (sources are the `.mmd` files next to them).

## Overview

![Rivulet architecture overview](docs/architecture-overview.png)

## 1. System architecture

```mermaid
flowchart LR
  subgraph Users
    ORG["Organizer<br/>(dashboard)"]
    FRI["Friends / contributors<br/>(public pay page)"]
    DEMO["Demo visitor<br/>(Try the demo)"]
  end

  subgraph Vercel["Next.js 16 on Vercel (App Router, TypeScript)"]
    direction TB
    UI["UI pages<br/>landing, /dashboard/*, /pay/[id]"]
    PROXY["proxy.ts<br/>Clerk middleware + demo cookie"]
    SESSION["lib/session.ts<br/>getUserId(): Clerk or demo user"]

    subgraph API["API routes"]
      BUILD["/api/build-flow"]
      INV["/api/read-invoice"]
      ORD["/api/orders<br/>/api/capture"]
      APPR["/api/flows/approve<br/>/refund, /remind, /[id]"]
      HOOK["/api/webhooks/paypal"]
      CRON["/api/cron/expire<br/>(daily)"]
      READ["/api/flows, /payments,<br/>/stats, /activity"]
    end

    subgraph RULES["Money rules in code (pure, unit-tested)"]
      FR["flowRules<br/>recipient + amount checks"]
      CR["contribution<br/>shares, deadlines,<br/>idempotent capture, refunds"]
      WR["webhookRules<br/>event to flow changes"]
    end

    AGENT["lib/agent.ts<br/>tool-calling agent<br/>find_contacts, check_recipient,<br/>create_flow"]
    PPLIB["lib/paypal.ts"]
    STORE["lib/store.ts<br/>row-locked transactions"]
  end

  CLERK[("Clerk<br/>sign-in")]
  DB[("Postgres / Supabase<br/>flows as jsonb")]
  BEDROCK[("Amazon Bedrock<br/>Nova Lite")]
  PAYPAL[("PayPal sandbox<br/>Orders, Payouts, Refunds,<br/>Webhooks, Reporting, JS SDK")]
  EMAIL[("Resend<br/>optional emails")]

  ORG --> UI
  DEMO --> UI
  FRI --> UI
  UI --> PROXY --> SESSION
  SESSION -.-> CLERK
  UI --> API

  BUILD --> AGENT --> BEDROCK
  AGENT --> FR
  INV --> BEDROCK
  ORD --> PPLIB
  APPR --> PPLIB
  CRON --> PPLIB
  HOOK --> WR
  ORD --> CR
  APPR --> CR
  READ --> STORE
  BUILD --> STORE
  CR --> STORE
  WR --> STORE
  STORE --> DB
  PPLIB <--> PAYPAL
  PAYPAL -- "signed webhook" --> HOOK
  APPR -.-> EMAIL
```

Key design decisions:

- **The AI plans; code enforces.** The agent can look up contacts and validate recipients but has no tool that moves money. Amounts must sum to the goal to the cent, and every date or condition must trace to the user's own words.
- **Money rules are pure functions** (`contribution`, `flowRules`, `webhookRules`), so they are unit-tested without a database or network.
- **All writes to a flow run in a row-locked transaction**, with a payout lock so two payout runs, or a payout and a refund, cannot overlap.
- **Public pages see a whitelist** (`publicFlow`): no owner id, no recipient addresses.

## 2. Life of a trip (sequence)

```mermaid
sequenceDiagram
  autonumber
  actor Org as Organizer
  actor Fr as Friend
  participant App as Rivulet (Next.js)
  participant AI as Bedrock agent
  participant DB as Postgres
  participant PP as PayPal

  Org->>App: "Lisbon for 4: $1,000 villa, $600 flights"
  App->>AI: prompt + contacts
  AI-->>App: plan (tools: find_contacts, check_recipient, create_flow)
  App->>App: guard rails (sum to the cent, valid recipients)
  App->>DB: save flow (Collecting)
  App-->>Org: pay link

  Fr->>App: open pay page, pick name
  App->>PP: create order (one per contributor)
  Fr->>PP: approve payment
  App->>PP: capture (verifies order belongs to the flow)
  App->>DB: record contribution (idempotent on capture id)

  alt pot is full
    App->>PP: Payouts to vendors (payout ids = flowId-pN)
    PP-->>App: signed webhook: payout SUCCEEDED
    App->>DB: mark payout paid, flow Paid out
  else cancelled or deadline missed
    Org->>App: Refund (or daily cron)
    App->>PP: refund each capture (request id from capture id)
    App->>DB: flow Refunded
  end

  PP-->>App: webhook: refunded / reversed / disputed
  App->>DB: flag payment, recompute collected
```

## 3. Flow states

```mermaid
stateDiagram-v2
  [*] --> Collecting: flow created
  Collecting --> NeedsApproval: goal met (safe holding state)
  Collecting --> Refunded: cancelled or deadline missed
  NeedsApproval --> PaidOut: payouts sent (automatic, or owner approves)
  NeedsApproval --> Scheduled: remaining payouts have a release date
  NeedsApproval --> NeedsApproval: a payout failed (fix recipient, retry)
  NeedsApproval --> Collecting: payment refunded or reversed
  NeedsApproval --> Refunded: cancelled
  Scheduled --> PaidOut: daily job on release date
  PaidOut --> NeedsApproval: payout failed or returned (retry)
  Refunded --> [*]
  PaidOut --> [*]

  state "Needs approval" as NeedsApproval
  state "Paid out" as PaidOut
```

Refunds are refused once any payout has been sent.

## 4. Design: pages and user journey

```mermaid
flowchart TD
  L["Landing page<br/>Log in / Try the demo"] -->|Try the demo| D
  L -->|Log in| SI["Sign in (Clerk)"] --> D

  subgraph D["Dashboard"]
    OV["Overview<br/>prompt box, stats, activity"]
    FL["Flows<br/>AG Grid, roster, re-split,<br/>approve, refund"]
    PAY["Payments<br/>ledger"]
    PE["People"]
    SE["Send"]
    SET["Settings"]
  end

  OV -->|"say the trip / attach invoice"| FL
  FL -->|share link| PP["Pay page /pay/[id]<br/>share, shares covered,<br/>days left, PayPal checkout"]
  PP --> TY["Thank-you screen"]
  PP -.->|"payments flow back"| FL
  FL --> PAY
```

## 5. Data model (stored per flow, as jsonb)

```mermaid
classDiagram
  class Flow {
    id
    ownerId
    name
    status
    goal
    collected
    currency
    participants
    deadline
    disbursingAt
  }
  class Contribution {
    id (PayPal capture id)
    amount
    payer
    memberId
    refundId
    reversedAt
    issue
  }
  class Payout {
    id (flowId-pN)
    label
    amount
    state
    recipient
    condition
    releaseOn
    issue
  }
  class RosterMember {
    id
    name
    email
    remindedAt
  }
  Flow "1" --> "*" Contribution
  Flow "1" --> "*" Payout
  Flow "1" --> "*" RosterMember
```
