"use client";

import StatusPill from "./StatusPill";
import type { Flow } from "@/data/dashboard";

const money = (n: number) => `$${n.toLocaleString()}`;

export default function FlowList({ flows, selectedId, onSelect }: { flows: Flow[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-3xl bg-white p-3 ring-1 ring-ink/5">
      <h2 className="px-3 pb-2 pt-3 text-lg font-extrabold text-ink">Your flows</h2>
      <ul>
        {flows.map((f) => {
          const pct = Math.round((f.collected / f.goal) * 100);
          const selected = f.id === selectedId;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                aria-pressed={selected}
                className={`w-full rounded-2xl px-3 py-3.5 text-left transition ${
                  selected ? "bg-paper ring-2 ring-ultra" : "hover:bg-paper"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-ink">{f.name}</span>
                  <StatusPill status={f.status} />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${pct === 100 ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink/65">
                  {money(f.collected)} of {money(f.goal)} · {f.contributors} {f.contributors === 1 ? "person" : "people"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
