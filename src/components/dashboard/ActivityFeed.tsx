"use client";

import { ArrowDownLeft, ArrowUpRight, Zap, Activity } from "lucide-react";
import { type ActivityItem, type ActivityTone } from "@/data/dashboard";

/* ─── Per-tone config ──────────────────────────────────────────────────── */
const TONE: Record<ActivityTone, { bg: string; icon: string; dot: string }> = {
  mint:    { bg: "bg-mint/15",      icon: "text-emerald-700",  dot: "bg-mint"    },
  ultra:   { bg: "bg-ultra/10",     icon: "text-ultra",        dot: "bg-ultra"   },
  coral:   { bg: "bg-coral/10",     icon: "text-coral",        dot: "bg-coral"   },
  saffron: { bg: "bg-saffron/20",   icon: "text-amber-700",    dot: "bg-saffron" },
};

function toneIcon(tone: ActivityTone) {
  if (tone === "mint")    return ArrowDownLeft;  // money coming in
  if (tone === "ultra")   return ArrowUpRight;   // payout going out
  if (tone === "coral")   return Zap;            // alert / failed
  return ArrowDownLeft;                          // saffron / pending
}

/* ─── Relative-time label ─────────────────────────────────────────────── */
function relativeLabel(time: string): string {
  const lower = time.toLowerCase();
  if (lower.includes("just") || lower.includes("min")) return "Today";
  if (lower.includes("hour")) return "Today";
  if (lower.match(/^1 day/)) return "Yesterday";
  return "Earlier";
}

/* ─── Group items by day bucket ───────────────────────────────────────── */
function groupItems(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const buckets: Record<string, ActivityItem[]> = {};
  for (const item of items) {
    const label = relativeLabel(item.time);
    (buckets[label] ??= []).push(item);
  }
  // Preserve order: Today → Yesterday → Earlier
  const order = ["Today", "Yesterday", "Earlier"];
  return order.filter((l) => buckets[l]).map((l) => ({ label: l, items: buckets[l] }));
}

/* ─── Empty state ─────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-paper text-ink/30">
        <Activity className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink/50">No activity yet</p>
      <p className="max-w-[220px] text-xs text-ink/35 leading-relaxed">
        Transactions will appear here once a flow collects its first payment.
      </p>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────────── */
export default function ActivityFeed({ items = [] }: { items?: ActivityItem[] }) {
  const groups = groupItems(items);

  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <h2 className="text-lg font-extrabold text-ink">Recent activity</h2>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(({ label, items: groupItems }) => (
            <div key={label}>
              {/* Day label */}
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-ink/35">
                {label}
              </p>

              <ul className="space-y-2">
                {groupItems.map((a, i) => {
                  const t = TONE[a.tone];
                  const Icon = toneIcon(a.tone);
                  return (
                    <li
                      key={`${a.text}-${i}`}
                      className="animate-fade-up flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-150 hover:bg-paper"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      {/* Icon badge */}
                      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-xl ${t.bg}`}>
                        <Icon className={`size-3.5 ${t.icon}`} />
                      </span>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{a.text}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${t.dot}`} />
                          <p className="text-[11px] text-ink/50">{a.time}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
