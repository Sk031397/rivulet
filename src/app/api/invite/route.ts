import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendInviteEmail } from "@/lib/email";

/**
 * POST /api/invite
 * Body: { email }
 * Sends a branded invite email to the address typed in the Invite modal (People page).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").toString().trim();
  if (!email || !email.includes("@")) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }

  // Invite link = the app origin (the join page isn't built yet, so land on the site).
  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host") ?? "rivulet.app"}`;
  await sendInviteEmail({ to: email, inviteLink: origin });

  return Response.json({ ok: true });
}
