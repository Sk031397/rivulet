import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

/**
 * Demo mode: the landing page's "Try the demo" button sets a cookie that lets
 * a visitor use the dashboard without signing in. Demo visitors all share one
 * owner id. Anyone who signs in with Clerk still gets their own private
 * account (a real session always wins over the demo cookie).
 */
export const DEMO_COOKIE = "rivulet_demo";
export const DEMO_USER_ID = "demo-user";

/** The current owner id: the Clerk user if signed in, else the demo user (demo cookie only). */
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (userId) return userId;
  const jar = await cookies();
  return jar.get(DEMO_COOKIE)?.value === "1" ? DEMO_USER_ID : null;
}
