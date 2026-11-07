"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpRight, X, Check, Clock, Lock, Users, Copy, ExternalLink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import StatusPill from "@/components/dashboard/StatusPill";
import { type Flow, type FlowStatus, type PayoutState } from "@/data/dashboard";

const money = (n: number) => `$${n.toLocaleString()}`;

const FILTERS = ["All", "Collecting", "Needs approval", "Paid out"] as const;
type FlowFilter = (typeof FILTERS)[number];

/* ── payout state config ─────────────────────────────────────────────── */
const STATE: Record<PayoutState, { icon: LucideIcon; label: string; chip: string; icon_bg: string }> = {
  paid:    { icon: Check, label: "Paid",    chip: "bg-mint/25 text-emerald-800",  icon_bg: "bg-mint text-ink"   },
  pending: { icon: Clock, label: "Pending", chip: "bg-saffron/30 text-amber-800", icon_bg: "bg-saffron text-ink"},
  locked:  { icon: Lock,  label: "On hold", chip: "bg-ink/10 text-ink",           icon_bg: "bg-ink text-white"  },
};
/* ── share-link helper ───────────────────────────────────────────────── */
function collectLink(flowName: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://rivulet.app";
  return `${base}/pay/${encodeURIComponent(flowName.toLowerCase().replace(/\s+/g, "-"))}`;
}

/* ── slide-over panel ────────────────────────────────────────────────── */
function FlowPanel({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(flow.name);
  const link = collectLink(name);

  /* close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const needsApproval = flow.status === "Needs approval";

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Flow: ${name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl shadow-ink/30"
      >
        {/* header */}
        <div className="flex items-center justify-between bg-ink px-6 py-4 shrink-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Flow details</p>
            {editingName ? (
              <form onSubmit={(e) => { e.preventDefault(); setEditingName(false); }} className="mt-1 flex items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-base font-extrabold text-white outline-none ring-2 ring-ultra"
                />
                <button type="submit" className="rounded-full bg-ultra px-2.5 py-1 text-xs font-bold text-white hover:bg-saffron">
                  Save
                </button>
                <button type="button" onClick={() => { setName(flow.name); setEditingName(false); }} className="text-xs text-white/50 hover:text-white">
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="mt-0.5 text-left text-xl font-extrabold text-white hover:text-saffron transition"
                title="Click to rename"
              >
                {name}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* status + stats */}
          <div className="flex items-center justify-between">
            <StatusPill status={flow.status} />
            <p className="text-sm text-ink/60">
              {flow.contributors} {flow.contributors === 1 ? "contributor" : "contributors"}
            </p>
          </div>

          {/* progress */}
          <div>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-extrabold text-ink">{money(flow.collected)}</span>
              <span className="text-sm font-semibold text-ink/55">of {money(flow.goal)} goal</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-full rounded-full transition-all ${
                  flow.collected >= flow.goal ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"
                }`}
                style={{ width: `${Math.min(100, Math.round((flow.collected / flow.goal) * 100))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink/50">
              {Math.round((flow.collected / flow.goal) * 100)}% funded
            </p>
          </div>

          {/* collect link */}
          <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/8">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50 mb-2">Collect link</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs font-mono text-ink/60 select-all">{link}</span>
              <button
                type="button"
                onClick={copyLink}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  copied ? "bg-mint/25 text-emerald-700" : "bg-ink text-white hover:bg-ultra"
                }`}
              >
                {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ultra hover:text-ink transition"
            >
              <ExternalLink className="size-3.5" /> Open collect page
            </a>
          </div>

          {/* payouts */}
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50 mb-3">Payouts</p>
            <ul className="space-y-2">
              {flow.payouts.map((p) => {
                const s = STATE[p.state];
                const Icon = s.icon;
                return (
                  <li key={p.label} className="flex items-start gap-3 rounded-2xl bg-paper p-4">
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${s.icon_bg}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-ink truncate">{p.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold shrink-0 ${s.chip}`}>{s.label}</span>
                      </div>
                      <p className="text-lg font-extrabold text-ink">{money(p.amount)}</p>
                      <p className="mt-0.5 text-xs leading-snug text-ink/60">{p.note}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* PayPal resources (if any) */}
          {flow.resources && flow.resources.length > 0 && (
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50 mb-3">PayPal resources</p>
              <ul className="space-y-2">
                {flow.resources.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{r.kind}{r.id ? ` · ${r.id}` : ""}</p>
                      {r.note && <p className="truncate text-xs text-ink/60">{r.note}</p>}
                    </div>
                    {r.link && (
                      <a href={r.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-ultra px-3 py-1 text-xs font-bold text-white hover:bg-ink">
                        Open
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* sticky footer actions */}
        <div className="shrink-0 border-t border-ink/8 bg-white px-6 py-4 flex flex-wrap gap-3">
          {needsApproval && !approved && (
            <button
              type="button"
              onClick={() => setApproved(true)}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ultra"
            >
              <Check className="size-4" /> Approve payouts
            </button>
          )}
          {approved && (
            <span className="inline-flex items-center gap-2 rounded-full bg-mint/25 px-5 py-2.5 text-sm font-bold text-emerald-700">
              <Check className="size-4" /> Approved
            </span>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-full bg-ultra/10 px-5 py-2.5 text-sm font-bold text-ultra transition hover:bg-ultra hover:text-white"
          >
            <Copy className="size-4" /> {copied ? "Copied!" : "Share link"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full px-5 py-2.5 text-sm font-bold text-ink/60 ring-1 ring-ink/15 transition hover:text-ink hover:ring-ink"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── main page ───────────────────────────────────────────────────────── */
export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [filter, setFilter] = useState<FlowFilter>("All");
  const [openFlow, setOpenFlow] = useState<Flow | null>(null);

  /** Fetch flows from the server store — keeps this list in sync with the Overview page. */
  const refreshFlows = useCallback(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d: { flows?: Flow[] }) => {
        if (d.flows) setFlows(d.flows);
      })
      .catch(() => {});
  }, []);

  // Load flows on mount
  useEffect(() => {
    refreshFlows();
  }, [refreshFlows]);

  // Poll every 10 seconds so flows built on the Overview page appear here too
  useEffect(() => {
    const id = setInterval(refreshFlows, 10_000);
    return () => clearInterval(id);
  }, [refreshFlows]);

  const visible: Flow[] = filter === "All" ? flows : flows.filter((f) => f.status === (filter as FlowStatus));

  const goToNewFlow = () => {
    router.push("/dashboard");
    setTimeout(() => {
      const el = document.getElementById("flow-prompt");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    }, 400);
  };

  return (
    <>
      <PageHeader title="Flows" subtitle="Every payment flow you've built, in one place.">
        <button
          type="button"
          onClick={goToNewFlow}
          className="inline-flex items-center gap-2 rounded-full bg-ultra px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-ultra/25 transition hover:bg-ink"
        >
          <Plus className="size-4" /> New flow
        </button>
      </PageHeader>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f === "All" ? flows.length : flows.filter((x) => x.status === f).length;
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                active ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/10 hover:text-ink"
              }`}
            >
              {f}
              <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20 text-white" : "bg-ink/10 text-ink/70"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* flow cards */}
      {visible.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          <p className="text-xl font-extrabold text-ink">
            {flows.length === 0 ? "No flows yet" : "No flows match this filter"}
          </p>
          <p className="mt-2 text-sm text-ink/55">
            {flows.length === 0
              ? "Head to Overview and describe a flow to create your first one."
              : "Try a different filter above."}
          </p>
          {flows.length === 0 && (
            <button
              type="button"
              onClick={goToNewFlow}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink"
            >
              <Plus className="size-4" /> Create a flow
            </button>
          )}
        </div>
      ) : (
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((f) => {
          const pct = Math.min(100, Math.round((f.collected / f.goal) * 100));
          const pending = f.payouts.filter((p) => p.state === "pending").length;
          return (
            <article
              key={f.id}
              className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/5 transition hover:ring-ultra/30 hover:shadow-lg hover:shadow-ink/5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-ink">{f.name}</h3>
                <StatusPill status={f.status} />
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full ${pct === 100 ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink/70">
                {money(f.collected)} of {money(f.goal)}
              </p>
              <p className="text-xs text-ink/55">
                {f.contributors} {f.contributors === 1 ? "person" : "people"} · {f.payouts.length} payouts
                {pending ? ` · ${pending} pending` : ""}
              </p>

              <ul className="mt-4 flex flex-wrap gap-2">
                {f.payouts.map((p) => (
                  <li key={p.label} className="rounded-lg bg-paper px-2.5 py-1 text-xs font-semibold text-ink/75 ring-1 ring-ink/5">
                    {p.label} · {money(p.amount)}
                  </li>
                ))}
              </ul>

              {/* open flow button */}
              <button
                type="button"
                onClick={() => setOpenFlow(f)}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-ultra transition hover:gap-2.5 hover:text-ink"
              >
                Open flow <ArrowUpRight className="size-4" />
              </button>
            </article>
          );
        })}
      </div>

      )}

      {/* slide-over */}
      {openFlow && <FlowPanel flow={openFlow} onClose={() => setOpenFlow(null)} />}
    </>
  );
}
