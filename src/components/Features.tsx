"use client";

import Reveal from "./Reveal";
import { FEATURES } from "@/data/content";

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        {FEATURES.map(({ icon: Icon, tone, title, text }, i) => (
          <Reveal as="li" key={title} from="up" delay={i * 80} className="group text-center">
            <span
              className={`mx-auto grid size-14 place-items-center rounded-2xl ${tone}
                transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}
            >
              <Icon className="size-6" />
            </span>
            <h3 className="mt-4 font-extrabold text-ink transition-colors duration-200 group-hover:text-ultra">
              {title}
            </h3>
            <p className="mx-auto mt-1 max-w-[210px] text-sm leading-relaxed text-ink/65">
              {text}
            </p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
