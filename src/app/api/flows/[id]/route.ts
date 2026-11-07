import type { NextRequest } from "next/server";
import { deleteFlow } from "@/lib/store";

/** DELETE /api/flows/[id] — remove a flow from the store. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteFlow(id);
  if (!ok) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ ok: true });
}
