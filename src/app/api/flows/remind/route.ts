import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/session";
import { getAllFlows, updateFlow } from "@/lib/store";
import { currencyOf, isPastDeadline, rosterStatus } from "@/lib/contribution";
import { emailConfigured, sendReminderEmail } from "@/lib/email";

/** One reminder per person per hour, so this can't be used to spam anyone. */
const REMIND_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * POST /api/flows/remind
 * Body: { flowId, memberId? }   (no memberId = everyone who still owes)
 *
 * Owner only. Emails a "your share is still open" nudge with the pay link to
 * people on the roster who haven't paid and have an email on file. Reports
 * honestly who was emailed, who was skipped and why.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { flowId?: unknown; memberId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const flowId = (body.flowId ?? "").toString().trim();
  const onlyMember = typeof body.memberId === "string" ? body.memberId : null;
  if (!flowId) return Response.json({ error: "flowId is required" }, { status: 400 });

  const flow = (await getAllFlows(userId)).find((f) => f.id === flowId);
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  if (flow.status !== "Collecting" || isPastDeadline(flow)) {
    return Response.json({ error: "This flow isn't collecting any more, so there's nothing to remind about." }, { status: 409 });
  }
  if (!emailConfigured()) {
    return Response.json(
      { error: "Email isn't set up on this server (RESEND_API_KEY). Copy the message and send it yourself.", emailConfigured: false },
      { status: 503 },
    );
  }

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host") ?? "localhost"}`;
  const link = `${origin}/pay/${encodeURIComponent(flow.id)}`;
  const now = Date.now();

  const status = rosterStatus(flow);
  const sent: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const sentIds: string[] = [];

  for (const s of status) {
    if (onlyMember && s.id !== onlyMember) continue;
    if (s.state === "paid" || s.outstanding <= 0) continue;
    const member = flow.roster?.find((m) => m.id === s.id);
    if (!member?.email) {
      skipped.push({ name: s.name, reason: "no email address" });
      continue;
    }
    if (member.remindedAt && now - Date.parse(member.remindedAt) < REMIND_COOLDOWN_MS) {
      skipped.push({ name: s.name, reason: "already reminded in the last hour" });
      continue;
    }
    const ok = await sendReminderEmail({
      to: member.email,
      name: s.name,
      flowName: flow.name,
      owed: s.outstanding,
      link,
      deadline: flow.deadline,
      currency: currencyOf(flow),
    });
    if (ok) {
      sent.push(s.name);
      sentIds.push(s.id);
    } else {
      skipped.push({ name: s.name, reason: "the email could not be sent" });
    }
  }

  if (sentIds.length) {
    const at = new Date(now).toISOString();
    await updateFlow(flowId, userId, (f) => {
      for (const m of f.roster ?? []) if (sentIds.includes(m.id)) m.remindedAt = at;
    });
  }

  return Response.json({ sent, skipped, emailConfigured: true });
}
