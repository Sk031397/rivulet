"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, X, MessageCircle, Wand2, CircleCheck, Zap } from "lucide-react";
import Header from "./Header";
import FlowMock from "./FlowMock";
import { BRAND } from "@/data/content";

const DEMO_STEPS = [
  {
    icon: MessageCircle,
    title: "1. Describe your goal",
    text: 'Type something like "Collect $500 for a cleanup and pay volunteers once tasks are verified."',
    tone: "bg-ultra/10 text-ultra",
  },
  {
    icon: Wand2,
    title: "2. AI designs the flow",
    text: "Rivulet maps who pays, who gets paid, in what amounts, and under what conditions — instantly.",
    tone: "bg-coral/15 text-coral",
  },
  {
    icon: Zap,
    title: "3. PayPal powers it",
    text: "Real PayPal orders, invoices, and payouts are created in the background. No manual steps.",
    tone: "bg-saffron/30 text-amber-700",
  },
  {
    icon: CircleCheck,
    title: "4. Watch it run",
    text: "Track every contribution and payout live. Approve, hold, or release funds at any time.",
    tone: "bg-mint/25 text-emerald-700",
  },
];

function DemoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Rivulet works"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* panel */}
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        {/* header */}
        <div className="flex items-center justify-between bg-ink px-8 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">How it works</p>
            <h2 className="text-xl font-extrabold text-white">{BRAND.name} in 4 steps</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo"
            className="grid size-9 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* steps */}
        <div className="grid gap-px bg-ink/5 sm:grid-cols-2">
          {DEMO_STEPS.map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="bg-white p-6">
              <span className={`inline-grid size-10 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </span>
              <h3 className="mt-3 font-extrabold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink/65">{text}</p>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-4 px-8 py-5">
          <p className="text-sm text-ink/55">
            No code. No setup. Just describe and go.
          </p>
          <Link
            href="/dashboard"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink"
          >
            Try it now <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section className="relative isolate overflow-hidden bg-paper">
      <div aria-hidden="true" className="absolute -right-48 -top-32 -z-10 h-[640px] w-[920px] rounded-full bg-gradient-to-br from-ultra via-ultra to-coral opacity-90 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-10 left-1/2 -z-10 h-32 w-[140%] -translate-x-1/2 rounded-[50%] bg-white blur-2xl" />

      <Header />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-10 lg:grid-cols-2 lg:px-8 lg:pb-32">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            {BRAND.name}
            <span className="block text-ultra">{BRAND.tagline}</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/75">
            Describe your idea and AI builds the payment flow: collect, split, and pay out on your conditions, all in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-ultra px-7 py-3.5 font-bold text-white shadow-lg shadow-ultra/30 transition hover:bg-ink">
              Create your flow <ArrowRight className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center gap-2 font-bold text-ink transition hover:text-ultra"
            >
              <span className="grid size-9 place-items-center rounded-full border-2 border-current transition">
                <Play className="size-3.5 fill-current" />
              </span>
              Watch demo
            </button>
          </div>
        </div>
        <FlowMock />
      </div>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </section>
  );
}
