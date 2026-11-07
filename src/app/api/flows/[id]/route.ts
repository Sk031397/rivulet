import type { NextRequest } from "next/server";
import { deleteFlow, updateFlow } from "@/lib/store";

/** DELETE /api/flows/[id] — remove a flow from the store. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteFlow(id);
  if (!ok) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ ok: true });
}

/** PATCH /api/flows/[id] — update mutable fields (name). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").toString().trim().slice(0, 80);
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const flow = updateFlow(id, (f) => { f.name = name; });
  if (!flow) return Response.json({ error: "flow not found" }, { status: 404 });
  return Response.json({ flow });
}
