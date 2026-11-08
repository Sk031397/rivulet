"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Crown, Sparkles, Star, Users } from "lucide-react";
import Mark from "./Mark";
import PayoutTile from "./PayoutTile";
import { BRAND } from "@/data/content";

const PAYOUTS = [
  { icon: Crown, label: "Team leader", amount: "$100", tone: "bg-saffron/30 text-amber-700" },
  { icon: Users, label: "Volunteers", amount: "$300", tone: "bg-ultra/10 text-ultra" },
  { icon: Star, label: "Future tasks", amount: "$100", tone: "bg-coral/15 text-coral" },
];

export default function FlowMock() {
  // Cycles 0,1,2 to light up each payout branch in sequence — the "machine" running.
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % PAYOUTS.length), 1400);
    return () => clearInterval(id);
  }, []);

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
          <Check className="size-6" />
        </span>
        <p className="mt-2 text-sm font-extrabold leading-tight">Flow<br />is live</p>
      </div>

      <div className="relative z-10 -rotate-3 rounded-3xl bg-white/80 p-5 shadow-2xl shadow-ink/25 ring-1 ring-white backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
            <Mark className="size-5 rounded-md" /> {BRAND.name}
          </span>
          <span className="size-6 rounded-full bg-linear-to-br from-saffron to-coral" />
        </div>

        {/* Prompt — pulses while the machine "thinks" */}
        <div className="animate-flow-pulse flex items-center gap-3 rounded-2xl bg-paper p-3">
          <Sparkles className="size-5 shrink-0 animate-pulse text-coral" />
          <p className="flex-1 text-[11px] leading-snug text-ink/80">
            Collect $500 for a community cleanup, and pay volunteers once their tasks are verified.
          </p>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ultra text-white">
            <ArrowRight className="size-4" />
          </span>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-bold text-ink">
          <span className="grid size-4 place-items-center rounded-full bg-mint text-ink"><Check className="size-3" /></span>
          Your flow is ready
        </p>

        {/* Source node */}
        <div className="mx-auto mt-3 w-44 rounded-xl bg-ink px-3 py-3 text-center text-white shadow-lg shadow-ink/30">
          <Users className="mx-auto size-5 text-saffron" />
          <p className="mt-1 text-[11px] font-semibold text-white/80">Collect contributions</p>
          <p className="text-sm font-extrabold">$500</p>
        </div>

        {/* Animated connectors — flowing current + travelling coins */}
        <svg aria-hidden="true" viewBox="0 0 300 36" className="mx-auto h-8 w-full">
          {/* static rail (faint) */}
          <path
            d="M150 0 V16 M44 36 V20 H256 V36 M150 16 V36"
            fill="none"
            className="text-ultra/15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* flowing current on top */}
          <path
            d="M150 0 V16 M44 36 V20 H256 V36 M150 16 V36"
            fill="none"
            className="animate-flow-dash text-ultra"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* three coins travelling toward each branch */}
          <circle r="2.6" className="fill-saffron" style={{ offsetPath: "path('M150 0 V16 M44 36 V20 H256 V36 M150 16 V36')", animation: "flow-particle 2.4s linear infinite" }} />
          <circle r="2.6" className="fill-ultra" style={{ offsetPath: "path('M150 0 V16 M44 36 V20 H256 V36 M150 16 V36')", animation: "flow-particle 2.4s linear infinite", animationDelay: "0.8s" }} />
          <circle r="2.6" className="fill-coral" style={{ offsetPath: "path('M150 0 V16 M44 36 V20 H256 V36 M150 16 V36')", animation: "flow-particle 2.4s linear infinite", animationDelay: "1.6s" }} />
        </svg>

        {/* Payout branches — light up in sequence as the flow runs */}
        <div className="grid grid-cols-3 gap-3">
          {PAYOUTS.map((p, i) => (
            <div
              key={p.label}
              className={`rounded-xl transition-all duration-500 ${
                active === i
                  ? "-translate-y-0.5 scale-[1.04] ring-2 ring-ultra/40"
                  : "scale-100 ring-0 opacity-85"
              }`}
            >
              <PayoutTile {...p} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
