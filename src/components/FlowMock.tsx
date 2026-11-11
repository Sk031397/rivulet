"use client";

/**
 * The hero's animated "flowing machine", drawn from a REAL flow.
 *
 * Every name, amount and status on it comes from the flow passed in (the
 * signed-in visitor's own latest flow). Nothing here is hard-coded. It receives
 * the public projection of a flow, so it never has recipients or owner ids.
 */

import { useEffect, useState } from "react";
import { Check, Clock, Crown, Sparkles, Star, Users, Wallet, type LucideIcon } from "lucide-react";
import Mark from "./Mark";
import PayoutTile from "./PayoutTile";
import { BRAND } from "@/data/content";
import type { PublicFlow } from "@/lib/publicFlow";

/** Decoration only: icons and colors cycle across the tiles; labels and amounts are the flow's. */
const TILE_STYLE: { icon: LucideIcon; tone: string }[] = [
  { icon: Crown, tone: "bg-saffron/30 text-amber-700" },
  { icon: Users, tone: "bg-ultra/10 text-ultra" },
  { icon: Star, tone: "bg-coral/15 text-coral" },
];
const MAX_TILES = 3;

const STATUS_ICON: Record<PublicFlow["status"], LucideIcon> = {
  Collecting: Wallet,
  "Needs approval": Clock,
  "Paid out": Check,
  Refunded: Wallet,
};

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** y positions inside the 300×36 connector drawing */
const RAIL_Y = 20;
const END_Y = 36;

export default function FlowMock({ flow }: { flow: PublicFlow }) {
  const tiles = flow.payouts.slice(0, MAX_TILES);
  const extra = flow.payouts.length - tiles.length;
  const n = tiles.length;

  // Lights up each payout branch in turn — the "machine" running.
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % n), 1400);
    return () => clearInterval(id);
  }, [n]);

  const pct = flow.goal > 0 ? Math.min(100, Math.round((flow.collected / flow.goal) * 100)) : 0;
  const StatusIcon = STATUS_ICON[flow.status];

  // Connector geometry follows the real number of payouts (1 to 3 branches).
  const centers = tiles.map((_, i) => ((i + 0.5) * 300) / n);
  const staticPath = [
    `M150 0 V${RAIL_Y}`,
    n > 1 ? `M${centers[0]} ${RAIL_Y} H${centers[n - 1]}` : "",
    ...centers.map((c) => `M${c} ${RAIL_Y} V${END_Y}`),
  ].join(" ");
  const activeCenter = centers[Math.min(active, n - 1)] ?? 150;
  const activePath = `M150 0 V${RAIL_Y} H${activeCenter} V${END_Y}`;

  return (
    <div className="relative mx-auto w-full max-w-140 lg:mx-0">
      <div className="animate-chip-bob absolute -left-8 top-24 z-20" style={{ ["--chip-rot" as string]: "-6deg" }}>
        <Mark className="size-20 rounded-3xl" />
      </div>

      <div
        className="animate-chip-bob absolute -right-3 top-8 z-20 hidden w-32 rounded-3xl bg-mint p-4 text-center text-ink shadow-2xl shadow-mint/40 sm:block"
        style={{ ["--chip-rot" as string]: "7deg", animationDelay: "1s" }}
      >
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-ink text-mint">
          <StatusIcon className="size-6" />
        </span>
        <p className="mt-2 text-sm font-extrabold leading-tight">{flow.status}</p>
      </div>

      <div className="relative z-10 -rotate-3 rounded-3xl bg-white/80 p-5 shadow-2xl shadow-ink/25 ring-1 ring-white backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
            <Mark className="size-5 rounded-md" /> {BRAND.name}
          </span>
          <span className="size-6 rounded-full bg-linear-to-br from-saffron to-coral" />
        </div>

        {/* The flow's own name */}
        <div className="animate-flow-pulse flex items-center gap-3 rounded-2xl bg-paper p-3">
          <Sparkles className="size-5 shrink-0 animate-pulse text-coral" />
          <p className="flex-1 truncate text-[12px] font-bold leading-snug text-ink/80" title={flow.name}>
            {flow.name}
          </p>
        </div>

        <p className="mt-5 text-center text-xs font-bold text-ink">
          Your latest flow · {flow.contributors} {flow.contributors === 1 ? "contributor" : "contributors"}
        </p>

        {/* Source node: real collected vs goal */}
        <div className="mx-auto mt-3 w-48 rounded-xl bg-ink px-3 py-3 text-center text-white shadow-lg shadow-ink/30">
          <Users className="mx-auto size-5 text-saffron" />
          <p className="mt-1 text-[11px] font-semibold text-white/80">Collected so far</p>
          <p className="text-sm font-extrabold">
            {money(flow.collected)} <span className="font-semibold text-white/55">of {money(flow.goal)}</span>
          </p>
          <div
            className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Funding progress"
          >
            <div className="h-full rounded-full bg-mint transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {n > 0 && (
          <>
            {/* Animated connectors — flowing current + coins travelling to the lit payout */}
            <svg aria-hidden="true" viewBox="0 0 300 36" className="mx-auto h-8 w-full">
              <path d={staticPath} fill="none" className="text-ultra/15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d={activePath} fill="none" className="animate-flow-dash text-ultra" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              {[
                { fill: "fill-saffron", delay: "0s" },
                { fill: "fill-ultra", delay: "0.8s" },
                { fill: "fill-coral", delay: "1.6s" },
              ].map((c) => (
                <circle
                  key={`${active}-${c.delay}`}
                  r="2.6"
                  className={c.fill}
                  style={{
                    offsetPath: `path('${activePath}')`,
                    animation: "flow-particle 2.4s linear infinite",
                    animationDelay: c.delay,
                  }}
                />
              ))}
            </svg>

            {/* Real payouts — light up in sequence */}
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {tiles.map((p, i) => (
                <div
                  key={p.label}
                  className={`rounded-xl transition-all duration-500 ${
                    active === i && n > 1 ? "-translate-y-0.5 scale-[1.04] ring-2 ring-ultra/40" : "scale-100 ring-0 opacity-90"
                  }`}
                >
                  <PayoutTile
                    icon={TILE_STYLE[i % TILE_STYLE.length].icon}
                    tone={TILE_STYLE[i % TILE_STYLE.length].tone}
                    label={p.label}
                    amount={money(p.amount)}
                  />
                </div>
              ))}
            </div>
            {extra > 0 && (
              <p className="mt-2 text-center text-[11px] font-semibold text-ink/50">
                +{extra} more {extra === 1 ? "payout" : "payouts"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
