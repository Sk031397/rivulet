import { getAllFlows } from "@/lib/store";

/** GET /api/flows — return all stored flows, newest first. */
export async function GET() {
  const flows = getAllFlows();
  return Response.json({ flows });
}
