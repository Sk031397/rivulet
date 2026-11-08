import { generateText } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { FlowSchema, toDashboardFlow, type FlowPlan } from "@/lib/flow";
import { createOrderForAmount, hasPayPalCreds } from "@/lib/paypal";
import { saveFlow } from "@/lib/store";

/* ─── Bedrock ────────────────────────────────────────────────────────── */
function makeBedrock() {
  return createAmazonBedrock({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    credentialProvider: fromNodeProviderChain(),
  });
}

/* ─── System prompt — design only, no tool calls ─────────────────────── */
const SYSTEM_PROMPT = `You are a payment-flow designer for Rivulet.
Given a user's plain-English goal, output a single JSON object — nothing else.
No markdown, no code fences, no explanation. Just raw JSON.

Required shape:
{
  "name": "<short human flow name, max 80 chars>",
  "summary": "<one sentence describing the flow>",
  "goal": <total USD amount as a number>,
  "payouts": [
    {
      "label": "<payout name>",
      "amount": <USD number>,
      "state": "pending",
      "note": "<when/how this releases>",
      "recipient": "<PayPal email of the recipient, or null if not known>"
    }
  ],
  "resources": []
}

Rules:
- payouts must be an array with 1–8 items
- payout amounts should roughly sum to the goal
- state must be "paid", "pending", or "locked"
- recipient must be a valid email string if the user mentioned a specific person's email, otherwise null
- resources must be an empty array (the system will fill it in)
- goal must be a positive number`;

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function parseFlowPlan(text: string): FlowPlan {
  const cleaned = stripFences(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Nova did not return JSON. Got: ${cleaned.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  return FlowSchema.parse(parsed);
}

function isRateLimit(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return (
    msg.includes("ThrottlingException") ||
    msg.includes("TooManyRequestsException") ||
    msg.toLowerCase().includes("rate") ||
    msg.toLowerCase().includes("quota") ||
    msg.includes("429")
  );
}

function retryAfterSeconds(err: unknown): number | null {
  const msg = String((err as Error)?.message ?? err);
  const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/([\d.]+)\s*second/i);
  return m ? Math.ceil(Number(m[1])) : null;
}

/* ─── Route ──────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = (body?.prompt ?? "").toString().trim();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });

  try {
    /* Step 1 — Ask Nova to design the flow (text only, no tools) */
    const bedrock = makeBedrock();
    const { text } = await generateText({
      model: bedrock("amazon.nova-lite-v1:0"),
      maxRetries: 0,
      system: SYSTEM_PROMPT,
      prompt,
    });

    const plan = parseFlowPlan(text);

    /* Step 2 — Create a real PayPal sandbox order for the goal amount */
    const resources: FlowPlan["resources"] = [];

    if (hasPayPalCreds()) {
      const order = await createOrderForAmount(plan.goal, plan.summary ?? plan.name);
      if (order.ok && order.orderId) {
        resources.push({
          kind: "PayPal Order",
          id: order.orderId,
          link: order.approveLink ?? null,
          note: `Collect $${plan.goal.toFixed(2)} — share this link for contributors to pay`,
        });
      }
    }

    const flow = toDashboardFlow({ ...plan, resources }, userId);

    // Persist to the database so webhooks/captures can find and update this flow
    await saveFlow(flow);

    return Response.json({
      flow,
      mode: hasPayPalCreds() ? "paypal" : "ai",
    });
  } catch (err) {
    console.error("[build-flow] failed:", err);

    if (isRateLimit(err)) {
      const retryAfter = retryAfterSeconds(err) ?? 5;
      return Response.json(
        {
          error: "rate_limit",
          message: `AWS Bedrock is busy. Please wait ${retryAfter} seconds and try again.`,
          retryAfter,
        },
        { status: 429 },
      );
    }

    const message =
      err instanceof Error ? err.message : "Flow generation failed. Check your AWS credentials and try again.";
    return Response.json({ error: "build_failed", message }, { status: 500 });
  }
}
