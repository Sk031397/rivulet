/**
 * What an anonymous contributor is allowed to see about a flow.
 *
 * Deliberately excludes the owner id, payout recipients (emails/phones), payer
 * identities, and PayPal resources. Every public-facing response (the pay page
 * lookup and the capture response) must go through this.
 */

import type { Flow, FlowStatus, PayoutState } from "@/data/dashboard";
import { shareFor } from "./contribution";

export interface PublicFlow {
  id: string;
  name: string;
  status: FlowStatus;
  collected: number;
  goal: number;
  contributors: number;
  /** Group size, when the flow is split between a fixed number of people. */
  participants?: number;
  /** One person's share in USD (goal / participants), when participants is set. */
  share?: number;
  /** ISO date (YYYY-MM-DD) after which no more money is accepted. */
  deadline?: string;
  payouts: Array<{ label: string; amount: number; state: PayoutState; note: string; condition?: string }>;
}

export function toPublicFlow(flow: Flow): PublicFlow {
  const share = shareFor(flow);
  return {
    id: flow.id,
    name: flow.name,
    status: flow.status,
    collected: flow.collected,
    goal: flow.goal,
    contributors: flow.contributors,
    ...(flow.participants ? { participants: flow.participants } : {}),
    ...(share !== null ? { share } : {}),
    ...(flow.deadline ? { deadline: flow.deadline } : {}),
    payouts: flow.payouts.map((p) => ({
      label: p.label,
      amount: p.amount,
      state: p.state,
      note: p.note,
      // Contributors are giving money on these terms, so they should see them.
      ...(p.condition ? { condition: p.condition } : {}),
    })),
  };
}

/**
 * Mask a recipient for contributor-facing output. Emails become "d•••@domain",
 * phones become "•••1234". Done server-side so the full address never leaves
 * the server for an anonymous caller.
 */
export function maskRecipient(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  if (!v || v === "null") return "a recipient";
  if (v.includes("@")) {
    const [local, domain] = v.split("@");
    return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(3, local.length - 1)))}@${domain}`;
  }
  const digits = v.replace(/\D/g, "");
  return `•••${digits.slice(-4)}`;
}
