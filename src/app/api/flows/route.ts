import { getUserId } from "@/lib/session";
import { getAllFlows } from "@/lib/store";
import { ensureDemoSample } from "@/lib/demoSeed";

/** GET /api/flows — return the signed-in user's stored flows, newest first. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  await ensureDemoSample(userId); // demo account only: avoids a blank first screen
  const flows = await getAllFlows(userId);
  return Response.json({ flows });
}
