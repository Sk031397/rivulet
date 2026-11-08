import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteFlow, updateFlow, getFlowByIdUnscoped } from "@/lib/store";

/**
 * GET /api/flows/[id] — public, single-flow lookup for the contributor-facing
 * pay page (/pay/[id]). Intentionally unauthenticated: contributors have no
 * session. Returns only the fields a contributor needs — never the ownerId.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getFlowByIdUnscoped(id);
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });

  // Strip owner-only and private fields; expose just what the pay page needs.
  // Payout recipients (emails/phones) are deliberately omitted — a contributor
  // doesn't need to see who gets paid or at what address.
  const publicFlow = {
    id: flow.id,
    name: flow.name,
    status: flow.status,
    collected: flow.collected,
    goal: flow.goal,
    contributors: flow.contributors,
    payouts: flow.payouts.map((p) => ({
      label: p.label,
      amount: p.amount,
      state: p.state,
      note: p.note,
    })),
    resources: flow.resources ?? [],
  };
  return Response.json({ flow: publicFlow });
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

/* ── recipient validation (mirrors the Send page rules) ──────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
const normalizePhone = (v: string) => v.replace(/[\s\-.()]/g, "");

/** Returns a cleaned recipient string, or null if the value is invalid. */
function cleanRecipient(raw: string): string | null {
  const v = raw.trim();
  if (!v) return ""; // empty is allowed — it clears the recipient
  if (v.includes("@")) return EMAIL_RE.test(v) ? v : null;
  const phone = normalizePhone(v);
  return PHONE_RE.test(phone) ? phone : null;
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

  const flow = await updateFlow(id, userId, (f) => {
    if (name !== null) f.name = name;
    if (recipientUpdates) {
      for (const u of recipientUpdates) {
        // Prefer matching by stable id; fall back to label for older flows.
        const payout =
          (u.id && f.payouts.find((p) => p.id === u.id)) ||
          f.payouts.find((p) => p.label === u.label);
        if (payout) payout.recipient = u.recipient || undefined;
      }
    }
  });

  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ flow });
}
