import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/session";

/**
 * GET /api/demo       — start a demo session (no sign-in) and open the dashboard.
 * GET /api/demo?exit=1 — end it and go back to the landing page.
 */
export async function GET(req: NextRequest) {
  const exit = req.nextUrl.searchParams.get("exit") === "1";
  const res = NextResponse.redirect(new URL(exit ? "/" : "/dashboard", req.url));
  if (exit) {
    res.cookies.delete(DEMO_COOKIE);
  } else {
    res.cookies.set(DEMO_COOKIE, "1", {
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
