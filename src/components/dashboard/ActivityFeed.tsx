"use client";

import { type ActivityItem, type ActivityTone } from "@/data/dashboard";

const DOT: Record<ActivityTone, string> = {
  mint: "bg-mint",
  ultra: "bg-ultra",
  coral: "bg-coral",
  saffron: "bg-saffron",
};

export default function ActivityFeed({ items = [] }: { items?: ActivityItem[] }) {
  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <h2 className="text-lg font-extrabold text-ink">Recent activity</h2>
      <ul className="mt-4 space-y-4">
        {items.map((a, i) => (
          <li key={`${a.text}-${i}`} className="flex gap-3">
            <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[a.tone]}`} />
            <div>
              <p className="text-sm font-semibold text-ink">{a.text}</p>
              <p className="text-xs text-ink/55">{a.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
