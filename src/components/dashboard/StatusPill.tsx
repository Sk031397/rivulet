"use client";

import type { FlowStatus } from "@/data/dashboard";

const TONES: Record<FlowStatus, string> = {
  Collecting: "bg-ultra/10 text-ultra",
  "Needs approval": "bg-coral/15 text-coral",
  "Paid out": "bg-mint/25 text-emerald-800",
  Refunded: "bg-ink/10 text-ink/70",
};

export default function StatusPill({ status }: { status: FlowStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${TONES[status] ?? "bg-ink/10 text-ink"}`}>
      {status}
    </span>
  );
}
