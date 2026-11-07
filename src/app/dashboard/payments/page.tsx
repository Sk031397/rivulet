"use client";

import { useState } from "react";
import { Download, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { type Payment, type PaymentStatus } from "@/data/dashboard";

const money = (n: number) => `$${n.toLocaleString()}`;

const STATUS: Record<PaymentStatus, string> = {
  completed: "bg-mint/25 text-emerald-800",
  pending:   "bg-saffron/30 text-amber-800",
  failed:    "bg-coral/15 text-coral",
};

const DIR: Record<"in" | "out", { icon: LucideIcon; label: string; chip: string }> = {
  in:  { icon: ArrowDownLeft, label: "In",  chip: "bg-mint/25 text-emerald-800" },
  out: { icon: ArrowUpRight,  label: "Out", chip: "bg-ultra/10 text-ultra"      },
};

const FILTERS = ["All", "In", "Out", "Pending"] as const;
type PaymentFilter = (typeof FILTERS)[number];

function exportCSV(rows: Payment[]) {
  const headers = ["Date", "Flow", "Who", "Direction", "Method", "Amount (USD)", "Status"];
  const lines = rows.map((p) =>
    [
      p.date,
      `"${p.flow}"`,
      `"${p.who}"`,
      p.direction === "in" ? "In" : "Out",
      p.method,
      (p.direction === "in" ? p.amount : -p.amount).toFixed(2),
      p.status,
    ].join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rivulet-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PaymentsPage() {
  const [filter, setFilter] = useState<PaymentFilter>("All");
  const PAYMENTS: Payment[] = [];

  const matches = (p: Payment): boolean => {
    if (filter === "All") return true;
    if (filter === "In") return p.direction === "in";
    if (filter === "Out") return p.direction === "out";
    return p.status === "pending";
  };
  const rows = PAYMENTS.filter(matches);

  const totalIn  = PAYMENTS.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const totalOut = PAYMENTS.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const pendingCount = PAYMENTS.filter((p) => p.status === "pending").length;

  const summary = [
    { label: "Money in", value: money(totalIn), note: `${PAYMENTS.filter((p) => p.direction === "in").length} collections`, tone: "text-emerald-700" },
    { label: "Money out", value: money(totalOut), note: `${PAYMENTS.filter((p) => p.direction === "out").length} payouts`, tone: "text-ultra" },
    { label: "Net flow", value: money(totalIn - totalOut), note: "across all flows", tone: "text-ink" },
    { label: "Pending", value: String(pendingCount), note: "awaiting approval", tone: "text-coral" },
  ];

  return (
    <>
      <PageHeader title="Payments" subtitle="Track money in and out across all your flows.">
        <button
          type="button"
          onClick={() => exportCSV(rows)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink shadow-sm ring-1 ring-ink/10 transition hover:ring-ultra"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <p className="text-sm font-semibold text-ink/65">{s.label}</p>
            <p className={`mt-2 text-3xl font-extrabold tracking-tight ${s.tone}`}>{s.value}</p>
            <p className="mt-2 text-xs text-ink/60">{s.note}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${active ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/10 hover:text-ink"}`}>
              {f}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-sm text-ink/55 ring-1 ring-ink/5">No payments match this filter.</p>
      ) : (
        <>
          {/* mobile: stacked cards */}
          <ul className="space-y-3 sm:hidden">
            {rows.map((p) => {
              const d = DIR[p.direction];
              const Icon = d.icon;
              return (
                <li key={p.id} className="rounded-3xl bg-white p-4 ring-1 ring-ink/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink/50">{p.date}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS[p.status]}`}>{p.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-extrabold text-ink">{p.flow}</p>
                  <p className="text-xs text-ink/65">{p.who}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${d.chip}`}>
                      <Icon className="size-3.5" /> {d.label}
                    </span>
                    <span className={`text-sm font-extrabold ${p.direction === "in" ? "text-emerald-700" : "text-ink"}`}>
                      {p.direction === "in" ? "+" : "−"}{money(p.amount)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink/45">{p.method}</p>
                </li>
              );
            })}
          </ul>

          {/* sm+: table */}
          <section className="hidden overflow-hidden rounded-3xl bg-white ring-1 ring-ink/5 sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-ink/10 text-xs font-bold uppercase tracking-wide text-ink/50">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Flow</th>
                    <th className="px-6 py-4">Who</th>
                    <th className="px-6 py-4">Direction</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const d = DIR[p.direction];
                    const Icon = d.icon;
                    return (
                      <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/60">
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-ink/70">{p.date}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-ink">{p.flow}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-ink/75">{p.who}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${d.chip}`}>
                            <Icon className="size-3.5" /> {d.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-ink/65">{p.method}</td>
                        <td className={`whitespace-nowrap px-6 py-4 text-right text-sm font-extrabold ${p.direction === "in" ? "text-emerald-700" : "text-ink"}`}>
                          {p.direction === "in" ? "+" : "−"}{money(p.amount)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS[p.status]}`}>{p.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
