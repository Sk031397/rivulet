import type { NextRequest } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";
import { isPastDeadline, payoutDue } from "@/lib/contribution";
import { refundFlow } from "@/lib/refund";
import { releaseDuePayouts } from "@/lib/release";
import type { Flow } from "@/data/dashboard";

/**
 * GET /api/cron/expire
 *
 * Runs daily (see vercel.json). Any flow whose deadline has passed without
 * reaching its goal has its contributors' money returned automatically.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without that secret
 * configured the route refuses to run, so it can't be triggered by strangers.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql<{ data: Flow }[]>`
    select data from flows
    where data->>'status' = 'Collecting' and data->>'deadline' is not null
  `;

  const expired = rows.map((r) => r.data).filter((f) => isPastDeadline(f) && f.collected < f.goal);
  const results: Array<{ id: string; refunded: number; failed: number }> = [];
  for (const f of expired) {
    if (f.collected <= 0) continue; // nothing to return
    const out = await refundFlow(f.id);
    results.push({ id: f.id, refunded: out.refunded, failed: out.failed });
  }

  // Second job: funded flows whose payouts were waiting for a release date.
  const scheduled = await sql<{ data: Flow }[]>`
    select data from flows where data->>'status' = 'Scheduled'
  `;
  const released: Array<{ id: string; sent: number; failed: number }> = [];
  for (const row of scheduled) {
    if (!row.data.payouts.some((p) => payoutDue(p))) continue;
    const out = await releaseDuePayouts(row.data.id);
    if (out) {
      released.push({
        id: row.data.id,
        sent: out.results.filter((r) => r.ok).length,
        failed: out.results.filter((r) => !r.ok).length,
      });
    }
  }
  return Response.json({ checked: rows.length, expired: expired.length, results, scheduled: scheduled.length, released });
}
