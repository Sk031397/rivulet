"use client";

import { ArrowRight } from "lucide-react";
import UseCaseCard from "./UseCaseCard";
import Reveal from "./Reveal";
import { USE_CASES } from "@/data/content";

export default function UseCases() {
  return (
    <section id="use-cases" className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[2fr_3fr] lg:px-8">
      <Reveal from="left">
        <h2 className="font-display text-4xl font-bold leading-tight tracking-tight text-ink">
          Create new ways for money to move.
        </h2>
        <p className="mt-5 max-w-sm leading-relaxed text-ink/70">
          From group trips to creator revenue, turn an idea into a payment experience people actually enjoy.
        </p>
        <a href="/dashboard/templates" className="group mt-6 inline-flex items-center gap-2 rounded-full border-2 border-ink px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-ink hover:text-white">
          Explore templates <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </a>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2">
        {USE_CASES.map((u, i) => (
          <Reveal key={u.title} from="up" delay={i * 90}>
            <UseCaseCard {...u} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
