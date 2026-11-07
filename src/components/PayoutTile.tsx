"use client";

import type { LucideIcon } from "lucide-react";

export default function PayoutTile({ icon: Icon, label, amount, tone }: { icon: LucideIcon; label: string; amount: string; tone: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3 text-center shadow-lg shadow-ink/10">
      <span className={`mx-auto grid size-8 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-4" />
      </span>
      <p className="mt-1.5 text-[11px] font-semibold text-ink/70">{label}</p>
      <p className="text-sm font-extrabold text-ink">{amount}</p>
    </div>
  );
}
