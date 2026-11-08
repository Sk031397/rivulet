import { z } from "zod";
import type { Flow } from "@/data/dashboard";

/**
 * The shape the LLM must return when designing a flow.
 * Used with `generateObject` so the model output is validated.
 */
export const FlowSchema = z.object({
  name: z.string().max(80),
  summary: z.string().max(240),
  goal: z.number().positive(),
  payouts: z
    .array(
      z.object({
        label: z.string().max(60),
        amount: z.number().nonnegative(),
        state: z.enum(["paid", "pending", "locked"]),
        note: z.string().max(140),
        recipient: z.string().max(200).nullable().optional(),
      }),
    )
    .min(1)
    .max(8),
  resources: z
    .array(
      z.object({
        kind: z.string().max(40),
        id: z.string().nullable(),
        link: z.string().nullable(),
        note: z.string().max(200),
      }),
    )
    .nullable(),
});

export type FlowPlan = z.infer<typeof FlowSchema>;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "flow";

/** Convert a validated LLM plan into the dashboard's Flow shape. */
export function toDashboardFlow(plan: FlowPlan, ownerId: string): Flow {
  const flowId = `${slug(plan.name)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: flowId,
    ownerId,
    name: plan.name,
    status: "Collecting",
    collected: 0,
    goal: plan.goal,
    contributors: 0,
    payouts: plan.payouts.map((p, i) => ({
      // Stable per-payout id so recipient edits can't be misassigned by label.
      id: `${flowId}-p${i}`,
      label: p.label,
      amount: p.amount,
      state: p.state,
      note: p.note,
      ...(p.recipient ? { recipient: p.recipient } : {}),
    })),
    resources: plan.resources ?? [],
  };
}
