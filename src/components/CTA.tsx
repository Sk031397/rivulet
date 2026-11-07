"use client";

import Link from "next/link";
import { ArrowRight, Check, QrCode, Users } from "lucide-react";
import Mark from "./Mark";
import { BRAND } from "@/data/content";

export default function CTA() {
  return (
    <section className="mx-auto max-w-250 px-4 py-20 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-3xl bg-ink px-8 py-12 shadow-2xl shadow-ink/30 sm:px-12">
        <div aria-hidden="true" className="absolute -bottom-24 right-0 -z-10 h-64 w-[75%] rounded-[50%] bg-linear-to-r from-transparent via-ultra to-coral opacity-80 blur-2xl" />
        <div aria-hidden="true" className="absolute right-8 top-8 hidden items-center gap-5 md:flex">
          <span className="grid size-14 -rotate-6 place-items-center rounded-2xl bg-saffron text-ink"><Users className="size-6" /></span>
          <span className="grid size-16 place-items-center rounded-2xl bg-white text-ink"><QrCode className="size-8" /></span>
          <span className="grid size-12 place-items-center rounded-full bg-mint text-ink"><Check className="size-6" /></span>
          <Mark className="size-24 rotate-6 rounded-3xl" />
        </div>
        <h2 className="max-w-sm text-3xl font-extrabold leading-tight text-white">
          The future of payments is programmable.
        </h2>
        <p className="mt-3 max-w-md text-sm text-white/80">
          Start building smart money flows with {BRAND.name} today.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-full bg-saffron px-6 py-2.5 text-sm font-extrabold text-ink transition hover:bg-white">
          Get started free <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
