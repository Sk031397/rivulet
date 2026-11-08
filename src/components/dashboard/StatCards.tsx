"use client";

import { type Stat } from "@/data/dashboard";

/* ─── Skeleton placeholder ─────────────────────────────────────────────── */
function SkeletonCard({ primary = false }: { primary?: boolean }) {
  if (primary) {
    return (
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 shadow-xl shadow-ink/25">
        <div className="skeleton h-3 w-28 opacity-30" />
        <div className="skeleton mt-3 h-9 w-24 opacity-30" />
        <div className="skeleton mt-3 h-2.5 w-32 opacity-20" />
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-8 w-20" />
      <div className="skeleton mt-3 h-2.5 w-28" />
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────────────────── */
export default function StatCards({
  stats = [],
  loading = false,
}: {
  stats?: Stat[];
  loading?: boolean;
}) {
  if (loading || stats.length === 0) {
    return (
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <SkeletonCard primary />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  const [balance, ...rest] = stats;

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
      {/* Primary balance card */}
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-xl shadow-ink/25 animate-fade-up">
        <div
          aria-hidden="true"
          className="absolute -bottom-16 -right-10 -z-10 size-48 rounded-full bg-linear-to-br from-ultra to-coral opacity-70 blur-2xl"
        />
        <p className="text-sm font-semibold text-white/70">{balance.label}</p>
        <p className="mt-2 text-4xl font-extrabold tracking-tight text-saffron">{balance.value}</p>
        <p className="mt-2 text-xs text-white/70">{balance.note}</p>
      </div>

      {rest.map((s, i) => (
        <div
          key={s.label}
          className="animate-fade-up rounded-3xl bg-white p-6 ring-1 ring-ink/5"
          style={{ animationDelay: `${(i + 1) * 70}ms` }}
        >
          <p className="text-sm font-semibold text-ink/65">{s.label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{s.value}</p>
          <p className="mt-2 text-xs text-ink/60">{s.note}</p>
        </div>
      ))}
    </section>
  );
}
