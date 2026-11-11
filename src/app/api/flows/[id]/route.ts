import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteFlow, updateFlow, getFlowByIdUnscoped } from "@/lib/store";
import { toPublicFlow } from "@/lib/publicFlow";
import { cleanRecipient } from "@/lib/flowRules";

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

  let body: { name?: unknown; payouts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const hasName = body.name !== undefined;
  const hasPayouts = body.payouts !== undefined;

  if (!hasName && !hasPayouts) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
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
  const refused: { label: string | null } = { label: null };
  const findPayout = (f: { payouts: Array<{ id?: string; label: string }> }, u: RecipientUpdate) =>
    (u.id && f.payouts.find((p) => p.id === u.id)) || f.payouts.find((p) => p.label === u.label);

  const flow = await updateFlow(id, userId, (f) => {
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
    if (recipientUpdates) {
      for (const u of recipientUpdates) {
        // Prefer matching by stable id; fall back to label for older flows.
        const payout = findPayout(f, u) as (typeof f.payouts)[number] | undefined;
        if (payout) payout.recipient = u.recipient || undefined;
      }
    }
  });

  if (refused.label) {
    return Response.json(
      { error: `"${refused.label}" has already been paid, so its recipient can't be changed.` },
      { status: 409 },
    );
  }
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ flow });
}
