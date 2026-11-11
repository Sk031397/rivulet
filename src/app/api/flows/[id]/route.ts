import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteFlow, updateFlow, getFlowByIdUnscoped } from "@/lib/store";
import { toPublicFlow } from "@/lib/publicFlow";
import { cleanRecipient } from "@/lib/flowRules";
import { MAX_ROSTER, cleanMemberName, refundable } from "@/lib/contribution";
import type { RosterMember } from "@/data/dashboard";

/**
 * GET /api/flows/[id] — public, single-flow lookup for the contributor-facing
 * pay page (/pay/[id]). Intentionally unauthenticated: contributors have no
 * session. Returns only the fields a contributor needs — never the ownerId.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getFlowByIdUnscoped(id);
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  // Contributors only ever see the public projection (no owner id, no recipients).
  return Response.json({ flow: toPublicFlow(flow) });
}

/** DELETE /api/flows/[id] — remove one of the signed-in user's flows. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const ok = await deleteFlow(id, userId);
  if (!ok) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ ok: true });
}

interface RecipientUpdate {
  id?: string;
  label: string;
  recipient: string;
}

/**
 * PATCH /api/flows/[id] — update mutable fields.
 * Accepts either:
 *   { name }                                        → rename the flow
 *   { payouts: [{ label, recipient }, …] }          → set payout recipients
 * (both may be present).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { name?: unknown; payouts?: unknown; roster?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const hasName = body.name !== undefined;
  const hasPayouts = body.payouts !== undefined;
  const hasRoster = body.roster !== undefined;

  if (!hasName && !hasPayouts && !hasRoster) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  // Validate the roster (the named people in the group) if provided.
  let rosterUpdate: Array<{ id?: string; name: string; email?: string }> | null = null;
  if (hasRoster) {
    if (!Array.isArray(body.roster) || body.roster.length > MAX_ROSTER) {
      return Response.json({ error: `roster must be a list of at most ${MAX_ROSTER} people` }, { status: 400 });
    }
    rosterUpdate = [];
    const seen = new Set<string>();
    for (const entry of body.roster as unknown[]) {
      const e = (typeof entry === "object" && entry !== null ? entry : {}) as { id?: unknown; name?: unknown; email?: unknown };
      const memberName = cleanMemberName(e.name);
      if (!memberName) return Response.json({ error: "every person needs a name" }, { status: 400 });
      if (seen.has(memberName.toLowerCase())) {
        return Response.json({ error: `"${memberName}" is listed twice` }, { status: 400 });
      }
      seen.add(memberName.toLowerCase());
      let email: string | undefined;
      const rawEmail = (e.email ?? "").toString().trim();
      if (rawEmail) {
        const cleaned = cleanRecipient(rawEmail);
        if (!cleaned || !cleaned.includes("@")) {
          return Response.json({ error: `"${memberName}" has an invalid email address` }, { status: 400 });
        }
        email = cleaned;
      }
      rosterUpdate.push({ id: typeof e.id === "string" ? e.id : undefined, name: memberName, email });
    }
  }

  // Validate name if provided.
  let name: string | null = null;
  if (hasName) {
    name = (body.name ?? "").toString().trim().slice(0, 80);
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  }

  // Validate payout recipient updates if provided.
  let recipientUpdates: RecipientUpdate[] | null = null;
  if (hasPayouts) {
    if (!Array.isArray(body.payouts)) {
      return Response.json({ error: "payouts must be an array" }, { status: 400 });
    }
    recipientUpdates = [];
    for (const entry of body.payouts as unknown[]) {
      if (typeof entry !== "object" || entry === null) {
        return Response.json({ error: "each payout update must be an object" }, { status: 400 });
      }
      const { id: payoutId, label, recipient } = entry as { id?: unknown; label?: unknown; recipient?: unknown };
      if (typeof label !== "string" || !label) {
        return Response.json({ error: "each payout update needs a label" }, { status: 400 });
      }
      const cleaned = cleanRecipient((recipient ?? "").toString());
      if (cleaned === null) {
        return Response.json(
          { error: `"${label}" has an invalid recipient — use a valid email or phone number` },
          { status: 400 },
        );
      }
      recipientUpdates.push({
        id: typeof payoutId === "string" ? payoutId : undefined,
        label,
        recipient: cleaned,
      });
    }
  }

  // A payout that has already been paid can't be re-pointed at someone else.
  // Checked before anything is applied, so a refused request changes nothing.
  const refused: { label: string | null; reason: string | null } = { label: null, reason: null };
  const findPayout = (f: { payouts: Array<{ id?: string; label: string }> }, u: RecipientUpdate) =>
    (u.id && f.payouts.find((p) => p.id === u.id)) || f.payouts.find((p) => p.label === u.label);

  const flow = await updateFlow(id, userId, (f) => {
    if (rosterUpdate) {
      if (f.status === "Paid out" || f.status === "Refunded") {
        refused.reason = "This flow is finished, so its list of people can't change.";
        return;
      }
      // Someone who has already paid can't be dropped from the list.
      const keep = new Set(rosterUpdate.map((m) => m.id).filter(Boolean));
      const paidIds = new Set(refundable(f).map((c) => c.memberId).filter(Boolean));
      const dropped = (f.roster ?? []).find((m) => paidIds.has(m.id) && !keep.has(m.id));
      if (dropped) {
        refused.reason = `${dropped.name} has already paid, so they can't be removed.`;
        return;
      }
    }
    if (recipientUpdates) {
      for (const u of recipientUpdates) {
        const payout = findPayout(f, u) as (typeof f.payouts)[number] | undefined;
        if (payout && payout.state === "paid" && (u.recipient || undefined) !== payout.recipient) {
          refused.label = payout.label;
          return;
        }
      }
    }
    if (name !== null) f.name = name;
    if (rosterUpdate) {
      const existing = new Set((f.roster ?? []).map((m) => m.id));
      const used = new Set<string>();
      let next = 0;
      const nextId = () => {
        while (existing.has(`m${next}`) || used.has(`m${next}`)) next++;
        return `m${next}`;
      };
      const rebuilt: RosterMember[] = rosterUpdate.map((m) => {
        const keepId = m.id && existing.has(m.id) && !used.has(m.id) ? m.id : nextId();
        used.add(keepId);
        return { id: keepId, name: m.name, ...(m.email ? { email: m.email } : {}) };
      });
      if (rebuilt.length > 0) {
        f.roster = rebuilt;
        if (rebuilt.length >= 2) f.participants = rebuilt.length;
      } else {
        delete f.roster;
      }
    }
    if (recipientUpdates) {
      for (const u of recipientUpdates) {
        // Prefer matching by stable id; fall back to label for older flows.
        const payout = findPayout(f, u) as (typeof f.payouts)[number] | undefined;
        if (payout) payout.recipient = u.recipient || undefined;
      }
    }
  });

  if (refused.reason) {
    return Response.json({ error: refused.reason }, { status: 409 });
  }
  if (refused.label) {
    return Response.json(
      { error: `"${refused.label}" has already been paid, so its recipient can't be changed.` },
      { status: 409 },
    );
  }
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ flow });
}
