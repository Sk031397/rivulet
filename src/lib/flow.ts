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
export function toDashboardFlow(plan: FlowPlan): Flow {
  return {
    id: `${slug(plan.name)}-${Math.random().toString(36).slice(2, 6)}`,
    name: plan.name,
    status: "Collecting",
    collected: 0,
    goal: plan.goal,
    contributors: 0,
    payouts: plan.payouts.map((p) => ({
      label: p.label,
      amount: p.amount,
      state: p.state,
      note: p.note,
    })),
    resources: plan.resources ?? [],
  };
}

/** Deterministic flow used when no LLM key is configured or a call fails. */
export function mockFlow(prompt: string): Flow {
  const m = prompt.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
  const goal = m ? Number(m[1].replace(/,/g, "")) || 500 : 500;
  const name = prompt.length > 44 ? `${prompt.slice(0, 44).trim()}…` : prompt || "New flow";
  return toDashboardFlow({
    name,
    summary: `Collect $${goal} and split it across payouts as requested.`,
    goal,
    payouts: [
      { label: "First payout", amount: Math.round(goal * 0.5), state: "pending", note: "Releases when half the goal is met" },
      { label: "Second payout", amount: Math.round(goal * 0.3), state: "locked", note: "Held until the next milestone" },
      { label: "Final payout", amount: Math.round(goal * 0.2), state: "locked", note: "Released on completion" },
    ],
    resources: [],
  });
}
