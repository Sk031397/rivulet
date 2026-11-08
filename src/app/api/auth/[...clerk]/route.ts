/**
 * Clerk handles its own auth routes internally via the middleware.
 * This file is not needed for Clerk v6 — routes like /api/auth/* are
 * intercepted by clerkMiddleware before reaching Next.js route handlers.
 *
 * Kept as a placeholder to satisfy Next.js App Router file conventions.
 */
export async function GET() {
  return new Response("Clerk auth", { status: 200 });
}
