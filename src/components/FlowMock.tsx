"use client";

import { ArrowRight, Check, Crown, Sparkles, Star, Users } from "lucide-react";
import Mark from "./Mark";
import PayoutTile from "./PayoutTile";
import { BRAND } from "@/data/content";

export default function FlowMock() {
  return (
    <div className="relative mx-auto w-full max-w-140 lg:mx-0">
      <div className="absolute -left-8 top-24 z-20 -rotate-6">
        <Mark className="size-20 rounded-3xl" />
      </div>

      <div className="absolute -right-3 top-8 z-20 hidden w-32 rotate-[7deg] rounded-3xl bg-mint p-4 text-center text-ink shadow-2xl shadow-mint/40 sm:block">
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

        <div className="flex items-center gap-3 rounded-2xl bg-paper p-3">
          <Sparkles className="size-5 shrink-0 text-coral" />
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

        <div className="mx-auto mt-3 w-44 rounded-xl bg-ink px-3 py-3 text-center text-white shadow-lg shadow-ink/30">
          <Users className="mx-auto size-5 text-saffron" />
          <p className="mt-1 text-[11px] font-semibold text-white/80">Collect contributions</p>
          <p className="text-sm font-extrabold">$500</p>
        </div>

        <svg aria-hidden="true" viewBox="0 0 300 30" className="mx-auto h-6 w-full text-ultra/40">
          <path d="M150 0 V14 M40 30 V18 H260 V30 M150 14 V30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>

        <div className="grid grid-cols-3 gap-3">
          <PayoutTile icon={Crown} label="Team leader" amount="$100" tone="bg-saffron/30 text-amber-700" />
          <PayoutTile icon={Users} label="Volunteers" amount="$300" tone="bg-ultra/10 text-ultra" />
          <PayoutTile icon={Star} label="Future tasks" amount="$100" tone="bg-coral/15 text-coral" />
        </div>
      </div>
    </div>
  );
}
