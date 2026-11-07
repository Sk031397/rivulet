import "dotenv/config";
import express from "express";
import { z } from "zod";
import {
  hasPayPalCreds,
  listTransactions,
  transactionsToActivity,
  transactionsToStats,
} from "./paypal.js";

const api = express();
api.use(express.json({ limit: "256kb" }));

// ---------------------------------------------------------------------------
// Mock data (used when no credentials are configured or PayPal calls fail)
// ---------------------------------------------------------------------------
const MOCK_ACTIVITY = [
  { text: "Jordan chipped in $25 to Neighborhood cleanup", time: "12 min ago", tone: "mint" },
  { text: "Team leader payout of $100 sent", time: "2 hours ago", tone: "ultra" },
  { text: "Album release split is ready for your approval", time: "Yesterday", tone: "coral" },
  { text: "Priya paid her share of Ski trip, Park City", time: "Yesterday", tone: "mint" },
  { text: "Logo project finished. All 3 milestones paid", time: "Oct 19", tone: "saffron" },
];

const MOCK_STATS = [
  { label: "Available balance", value: "$2,480.00", note: "$640 on hold in flows" },
  { label: "Collected this month", value: "$3,215", note: "+18% from last month" },
  { label: "Paid out", value: "$1,730", note: "across 14 payouts" },
  { label: "Active flows", value: "4", note: "1 needs your approval" },
];

// ---------------------------------------------------------------------------
// Flow-building LLM (Vercel AI SDK + PayPal Agent Toolkit)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Rivulet's payment-flow architect.
Given a user's plain-English goal, design a complete payment flow.

When PayPal tools are available, USE them to create real resources:
- Use create_order to produce a collect link people can pay into.
- Use invoice tools (create/send, create_recurring_series, create_conditional_rules)
  to model "trickle" payments and "hold / release on conditions".
- Capture any created resource IDs or approval links in the resources array.

Always return a JSON object matching the schema:
- name: short, human flow name
- summary: one sentence describing what the flow does
- goal: total amount to collect in USD (number)
- payouts: array of { label, amount (USD number), state ("paid"|"pending"|"locked"), note }
  where the payout amounts should roughly sum to the goal.
- resources: array of { kind, id?, link?, note } for any PayPal resources created.

Use realistic sandbox-sized amounts. Keep notes concise and friendly.`;

const FlowSchema = z.object({
  name: z.string().max(80),
  summary: z.string().max(240),
  goal: z.number().positive(),
  payouts: z
    .array(
      z.object({
        label: z.string().max(60),
        amount: z.number().nonnegative(),
        state: z.enum(["paid", "pending", "locked"]),
        note: z.string().max(140),
      }),
    )
    .min(1)
    .max(8),
  resources: z
    .array(
      z.object({
        kind: z.string().max(40),
        id: z.string().optional(),
        link: z.string().url().optional(),
        note: z.string().max(200),
      }),
    )
    .optional(),
});

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "flow";

function toDashboardFlow(obj) {
  return {
    id: `${slug(obj.name)}-${Math.random().toString(36).slice(2, 6)}`,
    name: obj.name,
    status: "Collecting",
    collected: 0,
    goal: obj.goal,
    contributors: 0,
    payouts: obj.payouts.map((p) => ({
      label: p.label,
      amount: p.amount,
      state: p.state,
      note: p.note,
    })),
    resources: obj.resources ?? [],
  };
}

function mockFlow(prompt) {
  const m = prompt.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
  const goal = m ? Number(m[1].replace(/,/g, "")) || 500 : 500;
  const name = prompt.length > 44 ? `${prompt.slice(0, 44).trim()}…` : prompt || "New flow";
  return toDashboardFlow({
    name,
    summary: `Collect $${goal} and split it across payouts as requested.`,
    goal,
    payouts: [
      { label: "First payout", amount: Math.round(goal * 0.5), state: "pending", note: "Releases when half the goal is met" },
      { label: "Second payout", amount: Math.round(goal * 0.3), state: "locked", note: "Held until the next milestone" },
      { label: "Final payout", amount: Math.round(goal * 0.2), state: "locked", note: "Released on completion" },
    ],
    resources: [],
  });
}

async function buildWithAI(prompt) {
  const { generateObject } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  let tools = undefined;
  if (hasPayPalCreds()) {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const toolkit = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      configuration: {
        context: { sandbox: process.env.PAYPAL_ENVIRONMENT !== "PRODUCTION" },
        actions: {
          orders: { create: true, get: true },
          invoices: {
            create: true,
            send: true,
            createRecurringSeries: true,
            createConditionalRules: true,
            list: true,
          },
          subscriptionPlans: { create: true, list: true },
          products: { create: true, list: true },
        },
      },
    });
    tools = toolkit.getTools();
  }

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    tools,
    maxSteps: 10,
    schema: FlowSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return toDashboardFlow(object);
}

// POST /api/build-flow
api.post("/build-flow", async (req, res) => {
  const prompt = req.body?.prompt?.toString().trim();
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  // No LLM key -> deterministic mock so the UI still works.
  if (!process.env.OPENAI_API_KEY) {
    return res.json({ flow: mockFlow(prompt), mode: "mock" });
  }

  try {
    const flow = await buildWithAI(prompt);
    res.json({ flow, mode: hasPayPalCreds() ? "paypal" : "ai" });
  } catch (err) {
    console.error("[build-flow] failed:", err);
    // Degrade to mock on any failure so the user still gets a flow.
    res.json({ flow: mockFlow(prompt), mode: "mock", error: String(err?.message ?? err) });
  }
});

// GET /api/activity — real PayPal transactions when available, else mock.
api.get("/activity", async (_req, res) => {
  const details = await listTransactions();
  if (details && details.length) {
    return res.json({ items: transactionsToActivity(details), mode: "paypal" });
  }
  res.json({ items: MOCK_ACTIVITY, mode: "mock" });
});

// GET /api/stats — derive monetary stats from real transactions, else mock.
api.get("/stats", async (_req, res) => {
  const details = await listTransactions();
  if (details && details.length) {
    const { collected, paidOut, count } = transactionsToStats(details);
    const stats = [
      { label: "Available balance", value: "$2,480.00", note: "$640 on hold in flows" },
      { label: "Collected this month", value: `$${collected.toLocaleString()}`, note: `${count} transactions` },
      { label: "Paid out", value: `$${paidOut.toLocaleString()}`, note: "from real PayPal activity" },
      { label: "Active flows", value: "4", note: "1 needs your approval" },
    ];
    return res.json({ stats, mode: "paypal" });
  }
  res.json({ stats: MOCK_STATS, mode: "mock" });
});

export default api;
