"use client";

import { EMPTY_STATS, type Stat } from "@/data/dashboard";

export default function StatCards({ stats = EMPTY_STATS }: { stats?: Stat[] }) {
  const [balance, ...rest] = stats;
  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-xl shadow-ink/25">
        <div aria-hidden="true" className="absolute -bottom-16 -right-10 -z-10 size-48 rounded-full bg-gradient-to-br from-ultra to-coral opacity-70 blur-2xl" />
        <p className="text-sm font-semibold text-white/70">{balance.label}</p>
        <p className="mt-2 text-4xl font-extrabold tracking-tight text-saffron">{balance.value}</p>
        <p className="mt-2 text-xs text-white/70">{balance.note}</p>
      </div>

      {rest.map((s) => (
        <div key={s.label} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
          <p className="text-sm font-semibold text-ink/65">{s.label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</p>
          <p className="mt-2 text-xs text-ink/60">{s.note}</p>
        </div>
      ))}
    </section>
  );
}
