import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runFlowAgent } from "@/lib/agent";
import { checkRecipient, isBlankRecipient, nameFromAddress, type Contact } from "@/lib/flowRules";
import { getAllFlows, saveFlow } from "@/lib/store";

/** Override to try a stronger model (e.g. amazon.nova-pro-v1:0). */
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const MAX_PROMPT_CHARS = 1000;
const MAX_CLIENT_CONTACTS = 200;

/* ─── Bedrock ────────────────────────────────────────────────────────── */
function makeBedrock() {
  return createAmazonBedrock({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    credentialProvider: fromNodeProviderChain(),
  });
}

/* ─── Contacts the agent may resolve names against ───────────────────── */

/** Keep only plain name characters so a saved name can't smuggle in instructions. */
const cleanName = (s: unknown) =>
  String(s ?? "")
    .replace(/[^\p{L}\p{N} .'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

/**
 * Past recipients from the user's own flows, plus contacts saved in their
 * browser address book (sent by the client). Client data is untrusted: only
 * addresses that pass validation are kept, and names are scrubbed.
 */
async function collectContacts(ownerId: string, clientContacts: unknown): Promise<Contact[]> {
  const byAddress = new Map<string, Contact>();
  const add = (address: string, name: string) => {
    const key = address.toLowerCase();
    // Prefer a real saved name over one derived from the address.
    if (!byAddress.has(key) || name !== nameFromAddress(address)) {
      byAddress.set(key, { name: name || nameFromAddress(address), address });
    }
  };

  for (const flow of await getAllFlows(ownerId)) {
    for (const p of flow.payouts) {
      if (isBlankRecipient(p.recipient)) continue;
      const check = checkRecipient(p.recipient as string);
      if (check.valid) add(check.value, nameFromAddress(check.value));
    }
  }

  if (Array.isArray(clientContacts)) {
    for (const raw of clientContacts.slice(0, MAX_CLIENT_CONTACTS)) {
      if (typeof raw !== "object" || raw === null) continue;
      const { name, address } = raw as { name?: unknown; address?: unknown };
      if (typeof address !== "string") continue;
      const check = checkRecipient(address);
      if (check.valid) add(check.value, cleanName(name));
    }
  }

  return Array.from(byAddress.values());
}

/* ─── Errors ─────────────────────────────────────────────────────────── */
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
  let clientContacts: unknown;
  try {
    const body = (await req.json()) as { prompt?: unknown; contacts?: unknown };
    prompt = (body?.prompt ?? "").toString().trim();
    clientContacts = body?.contacts;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return Response.json(
      { error: "prompt_too_long", message: `Keep your description under ${MAX_PROMPT_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const contacts = await collectContacts(userId, clientContacts);
    const bedrock = makeBedrock();

    const { flow, steps, warnings, reply, problem } = await runFlowAgent({
      model: bedrock(MODEL_ID),
      prompt,
      ownerId: userId,
      contacts,
    });

    if (!flow) {
      // Tell the user WHY, in the agent's own words where it said something
      // useful, instead of a generic failure.
      const message = problem
        ? `I couldn't create that flow — ${problem}`
        : reply ||
          "The assistant couldn't turn that into a valid flow. Try stating the total amount and who gets paid how much.";
      return Response.json({ error: "agent_incomplete", message, steps }, { status: 422 });
    }

    // Persist so contributors can pay into it and captures can find it.
    await saveFlow(flow);

    return Response.json({ flow, steps, warnings });
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
