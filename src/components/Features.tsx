"use client";

import { FEATURES } from "@/data/content";

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        {FEATURES.map(({ icon: Icon, tone, title, text }) => (
          <li key={title} className="text-center">
            <span className={`mx-auto grid size-14 place-items-center rounded-2xl ${tone}`}>
              <Icon className="size-6" />
            </span>
            <h3 className="mt-4 font-extrabold text-ink">{title}</h3>
            <p className="mx-auto mt-1 max-w-52.5 text-sm leading-relaxed text-ink/65">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
