"use client";

import type { LucideIcon } from "lucide-react";

export default function UseCaseCard({ icon: Icon, title, text, img, fallback }: { icon: LucideIcon; title: string; text: string; img: string; fallback: string }) {
  return (
    <article className={`group relative flex h-[140px] items-end overflow-hidden rounded-2xl bg-gradient-to-br ${fallback} shadow-lg shadow-ink/15 sm:h-[165px]`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
      <div className="relative flex items-center gap-3 p-4 text-white">
        <Icon className="size-9 shrink-0 text-saffron" />
        <div>
          <h3 className="text-sm font-extrabold">{title}</h3>
          <p className="text-xs text-white/90">{text}</p>
        </div>
      </div>
    </article>
  );
}
