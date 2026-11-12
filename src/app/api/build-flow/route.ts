import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/session";
import { runFlowAgent } from "@/lib/agent";
import { checkRecipient, isBlankRecipient, matchKnownAddress, nameFromAddress, type Contact } from "@/lib/flowRules";
import { getAllFlows, saveFlow } from "@/lib/store";
import { markInvoiceRecipients } from "@/lib/contribution";
import { MODEL_ID, makeBedrock } from "@/lib/bedrock";

const MAX_PROMPT_CHARS = 1000;
const MAX_CLIENT_CONTACTS = 200;

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
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let prompt = "";
  let clientContacts: unknown;
  let fromInvoice = false;
  try {
    const body = (await req.json()) as { prompt?: unknown; contacts?: unknown; fromInvoice?: unknown };
    prompt = (body?.prompt ?? "").toString().trim();
    clientContacts = body?.contacts;
    // Set by the prompt box when the payee's email was read from an invoice by the AI.
    // It can only add a safety hold, never remove one, so trusting the client is fine.
    fromInvoice = body?.fromInvoice === true;
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

    // An address the AI read from an invoice could be misread (e.g. "l" as "1").
    // If it is, or looks like, an address this user already pays, use that one.
    // Anything unknown is held: nothing is paid to it until the organizer approves.
    if (fromInvoice) {
      const unknown: typeof flow.payouts = [];
      for (const p of flow.payouts) {
        if (p.state === "paid" || !p.recipient) continue;
        const fixed = matchKnownAddress(p.recipient, contacts);
        if (fixed) {
          warnings.push(`The invoice was read as "${p.recipient}". Using your known address ${fixed} instead.`);
          p.recipient = fixed;
          continue;
        }
        const known = contacts.some((c) => c.address.trim().toLowerCase() === p.recipient!.trim().toLowerCase());
        if (!known) unknown.push(p);
      }
      if (markInvoiceRecipients({ payouts: unknown }) > 0) {
        warnings.push("The payee's email was read from the invoice. Check it: nothing is paid to it until you approve.");
      }
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
