"use client";

import { ArrowRight } from "lucide-react";
import { STEPS } from "@/data/content";

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-paper px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-ink">Just describe it. We’ll handle the rest.</h2>
        <ol className="mt-12 grid items-start gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="contents">
              <div className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-ultra text-white shadow-lg shadow-ultra/30">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-4 font-extrabold text-ink">{i + 1}. {title}</h3>
                <p className="mx-auto mt-1 max-w-[230px] text-sm leading-relaxed text-ink/70">{text}</p>
              </div>
              {i < STEPS.length - 1 && <ArrowRight aria-hidden="true" className="mt-5 hidden size-5 text-coral md:block" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
