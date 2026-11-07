"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Clock, Lock, Copy, ExternalLink, Loader2, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type RowClickedEvent,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import PageHeader from "@/components/dashboard/PageHeader";
import StatusPill from "@/components/dashboard/StatusPill";
import { type Flow, type FlowStatus, type PayoutState } from "@/data/dashboard";

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

/* ── helpers ─────────────────────────────────────────────────────────── */
const money = (n: number) => `$${n.toLocaleString()}`;

const FILTERS = ["All", "Collecting", "Needs approval", "Paid out"] as const;
type FlowFilter = (typeof FILTERS)[number];

const STATE: Record<PayoutState, { icon: LucideIcon; label: string; chip: string; icon_bg: string }> = {
  paid:    { icon: Check, label: "Paid",    chip: "bg-mint/25 text-emerald-800",  icon_bg: "bg-mint text-ink"    },
  pending: { icon: Clock, label: "Pending", chip: "bg-saffron/30 text-amber-800", icon_bg: "bg-saffron text-ink" },
  locked:  { icon: Lock,  label: "On hold", chip: "bg-ink/10 text-ink",           icon_bg: "bg-ink text-white"   },
};

function collectLink(flowId: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://rivulet.app";
  return `${base}/pay/${encodeURIComponent(flowId)}`;
}

/* ── AG Grid cell renderers ──────────────────────────────────────────── */
function StatusCell({ value }: { value: FlowStatus }) {
  return <StatusPill status={value} />;
}

function ProgressCell({ data }: { data: Flow }) {
  if (!data) return null;
  const pct = Math.min(100, Math.round((data.collected / data.goal) * 100));
  const funded = data.collected >= data.goal;
  return (
    <div className="flex w-full items-center gap-2">
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full ${funded ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold text-ink/60 w-9 text-right">{pct}%</span>
    </div>
  );
}

function CollectedCell({ data }: { data: Flow }) {
  if (!data) return null;
  return (
    <span className="tabular-nums font-bold text-ink">
      {money(data.collected)}<span className="text-ink/40 font-normal"> / {money(data.goal)}</span>
    </span>
  );
}

function PayoutsCell({ data }: { data: Flow }) {
  if (!data) return null;
  const pending = data.payouts.filter((p) => p.state === "pending").length;
  return (
    <span className="text-sm text-ink/70">
      {data.payouts.length} total{pending > 0 ? `, ${pending} pending` : ""}
    </span>
  );
}

/* ── FlowPanel slide-over (unchanged logic) ─────────────────────────── */
function FlowPanel({ flow, onClose, onDelete, refreshFlows }: {
  flow: Flow;
  onClose: () => void;
  onDelete?: (flowId: string) => void;
  refreshFlows: () => void;
}) {
  const [copied, setCopied]           = useState(false);
  const [approved, setApproved]       = useState(false);
  const [approving, setApproving]     = useState(false);
  const [approveResult, setApproveResult] = useState<{
    attempted: number; disbursed: number; failed: number;
    results: { label: string; recipient: string; amount: number; ok: boolean; batchId?: string; itemStatus?: string; error?: string }[];
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName]               = useState(flow.name);
  const link = collectLink(flow.id);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

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
      <div className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`Flow: ${name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl shadow-ink/30">

        {/* header */}
        <div className="flex items-center justify-between bg-ink px-6 py-4 shrink-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Flow details</p>
            {editingName ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim()) return;
                try {
                  await fetch(`/api/flows/${encodeURIComponent(flow.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim() }),
                  });
                  refreshFlows();
                } finally {
                  setEditingName(false);
                }
              }} className="mt-1 flex items-center gap-2">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-base font-extrabold text-white outline-none ring-2 ring-ultra" />
                <button type="submit" className="rounded-full bg-ultra px-2.5 py-1 text-xs font-bold text-white hover:bg-saffron">Save</button>
                <button type="button" onClick={() => { setName(flow.name); setEditingName(false); }} className="text-xs text-white/50 hover:text-white">Cancel</button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditingName(true)}
                className="mt-0.5 text-left text-xl font-extrabold text-white hover:text-saffron transition" title="Click to rename">
                {name}
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel"
            className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <StatusPill status={flow.status} />
            <p className="text-sm text-ink/60">{flow.contributors} {flow.contributors === 1 ? "contributor" : "contributors"}</p>
          </div>

          {/* progress */}
          <div>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-extrabold text-ink">{money(flow.collected)}</span>
              <span className="text-sm font-semibold text-ink/55">of {money(flow.goal)} goal</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/10">
              <div className={`h-full rounded-full transition-all ${flow.collected >= flow.goal ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
                style={{ width: `${Math.min(100, Math.round((flow.collected / flow.goal) * 100))}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink/50">{Math.round((flow.collected / flow.goal) * 100)}% funded</p>
          </div>

          {/* collect link */}
          <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/8">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50 mb-2">Collect link</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-xs font-mono text-ink/60 select-all">{link}</span>
              <button type="button" onClick={copyLink}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${copied ? "bg-mint/25 text-emerald-700" : "bg-ink text-white hover:bg-ultra"}`}>
                {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
            <a href={link} target="_blank" rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ultra hover:text-ink transition">
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
                      {p.recipient && (
                        <p className="mt-1.5 truncate rounded-lg bg-ultra/10 px-2 py-1 text-[11px] font-mono text-ultra">
                          &#8594; {p.recipient}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* PayPal resources */}
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
                      <a href={r.link} target="_blank" rel="noreferrer"
                        className="shrink-0 rounded-full bg-ultra px-3 py-1 text-xs font-bold text-white hover:bg-ink">Open</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* approve results */}
          {approveResult && (
            <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50 mb-3">
                Payout results · {approveResult.disbursed}/{approveResult.attempted} sent
              </p>
              <ul className="space-y-2">
                {approveResult.results.map((r) => (
                  <li key={r.label} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${r.ok ? "bg-mint/20" : "bg-coral/10"}`}>
                    <div className="min-w-0">
                      <p className="font-bold text-ink truncate">{r.label}</p>
                      <p className="text-[11px] font-mono text-ink/60 truncate">{r.recipient}</p>
                      {r.ok
                        ? <p className="text-xs text-emerald-700">${r.amount.toFixed(2)} · {r.itemStatus ?? "—"}</p>
                        : <p className="text-xs text-coral truncate">{r.error ?? "failed"}</p>}
                    </div>
                    {r.ok ? <Check className="size-4 shrink-0 text-emerald-600" /> : <X className="size-4 shrink-0 text-coral" />}
                  </li>
                ))}
              </ul>
              {approveResult.attempted === 0 && (
                <p className="text-xs text-ink/55">No recipient emails on this flow.</p>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-ink/8 bg-white px-6 py-4 flex flex-wrap gap-3">
          {needsApproval && !approved && (
            <button type="button" disabled={approving}
              onClick={async () => {
                setApproving(true);
                try {
                  const res = await fetch("/api/flows/approve", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ flowId: flow.id }),
                  });
                  const data = await res.json() as { payouts?: typeof approveResult };
                  setApproveResult(data.payouts ?? null);
                } catch { /* poll reconciles */ }
                finally { setApproving(false); setApproved(true); }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ultra disabled:opacity-60 disabled:cursor-not-allowed">
              {approving ? <><Loader2 className="size-4 animate-spin" /> Sending payouts…</> : <><Check className="size-4" /> Approve payouts</>}
            </button>
          )}
          {approved && (
            <span className="inline-flex items-center gap-2 rounded-full bg-mint/25 px-5 py-2.5 text-sm font-bold text-emerald-700">
              <Check className="size-4" /> Approved
            </span>
          )}
          <button type="button" onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-full bg-ultra/10 px-5 py-2.5 text-sm font-bold text-ultra transition hover:bg-ultra hover:text-white">
            <Copy className="size-4" /> {copied ? "Copied!" : "Share link"}
          </button>
          {confirmDelete ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-5 py-2.5 text-sm font-bold text-coral">
              Delete this flow?
              <button type="button"
                onClick={async () => {
                  try { await fetch(`/api/flows/${encodeURIComponent(flow.id)}`, { method: "DELETE" }); } catch { /* optimistic */ }
                  onDelete?.(flow.id);
                }}
                className="rounded-full bg-coral px-3 py-1 text-xs text-white hover:bg-coral/80">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-ink/60 hover:text-ink">Cancel</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="rounded-full px-5 py-2.5 text-sm font-bold text-ink/45 transition hover:text-coral">Delete</button>
          )}
          <button type="button" onClick={onClose}
            className="ml-auto rounded-full px-5 py-2.5 text-sm font-bold text-ink/60 ring-1 ring-ink/15 transition hover:text-ink hover:ring-ink">Close</button>
        </div>
      </aside>
    </>
  );
}

/* ── main page ───────────────────────────────────────────────────────── */
export default function FlowsPage() {
  const router    = useRouter();
  const gridApi   = useRef<GridApi<Flow> | null>(null);

  const [flows, setFlows]         = useState<Flow[]>([]);
  const [filter, setFilter]       = useState<FlowFilter>("All");
  const [openFlow, setOpenFlow]   = useState<Flow | null>(null);
  const [quickFilter, setQuick]   = useState("");

  const refreshFlows = useCallback(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d: { flows?: Flow[] }) => { if (d.flows) setFlows(d.flows); })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshFlows(); }, [refreshFlows]);
  useEffect(() => {
    const id = setInterval(refreshFlows, 10_000);
    return () => clearInterval(id);
  }, [refreshFlows]);

  useEffect(() => {
    gridApi.current?.setGridOption("quickFilterText", quickFilter);
  }, [quickFilter]);

  const rows = useMemo<Flow[]>(() => {
    if (filter === "All") return flows;
    return flows.filter((f) => f.status === (filter as FlowStatus));
  }, [flows, filter]);

  /* ── column definitions ─────────────────────────────────────────────── */
  const colDefs = useMemo<ColDef<Flow>[]>(() => [
    {
      field: "name",
      headerName: "Flow name",
      flex: 2,
      minWidth: 160,
      sortable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellStyle: { fontWeight: 700 },
    },
    {
      field: "status",
      headerName: "Status",
      width: 160,
      sortable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: StatusCell,
    },
    {
      headerName: "Collected / Goal",
      width: 190,
      sortable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      valueGetter: (p) => p.data?.collected ?? 0,
      cellRenderer: CollectedCell,
      type: "rightAligned",
    },
    {
      headerName: "Progress",
      width: 160,
      sortable: true,
      valueGetter: (p) => p.data ? Math.round((p.data.collected / p.data.goal) * 100) : 0,
      cellRenderer: ProgressCell,
    },
    {
      field: "contributors",
      headerName: "Contributors",
      width: 130,
      sortable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      type: "rightAligned",
    },
    {
      headerName: "Payouts",
      width: 160,
      sortable: false,
      cellRenderer: PayoutsCell,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    suppressMovable: false,
  }), []);

  const onGridReady = useCallback((e: GridReadyEvent<Flow>) => {
    gridApi.current = e.api;
    e.api.sizeColumnsToFit();
  }, []);

  const onRowClicked = useCallback((e: RowClickedEvent<Flow>) => {
    if (e.data) setOpenFlow(e.data);
  }, []);

  const goToNewFlow = () => {
    router.push("/dashboard");
    setTimeout(() => {
      const el = document.getElementById("flow-prompt");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    }, 400);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title="Flows" subtitle="Every payment flow you've built, in one place.">
        <button type="button" onClick={goToNewFlow}
          className="inline-flex items-center gap-2 rounded-full bg-ultra px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-ultra/25 transition hover:bg-ink">
          <Plus className="size-4" /> New flow
        </button>
      </PageHeader>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* status filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count = f === "All" ? flows.length : flows.filter((x) => x.status === f).length;
            const active = filter === f;
            return (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${active ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/10 hover:text-ink"}`}>
                {f}
                <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20 text-white" : "bg-ink/10 text-ink/70"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* quick search */}
        <div className="relative ml-auto flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink/40 pointer-events-none" />
          <input type="search" value={quickFilter} onChange={(e) => setQuick(e.target.value)}
            placeholder="Search flows…"
            className="w-full rounded-2xl bg-white pl-9 pr-4 py-2 text-sm text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/40 focus:ring-2 focus:ring-ultra" />
        </div>
      </div>

      {/* empty state */}
      {flows.length === 0 && (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          <p className="text-xl font-extrabold text-ink">No flows yet</p>
          <p className="mt-2 text-sm text-ink/55">Head to Overview and describe a flow to create your first one.</p>
          <button type="button" onClick={goToNewFlow}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink">
            <Plus className="size-4" /> Create a flow
          </button>
        </div>
      )}

      {/* AG Grid */}
      {flows.length > 0 && (
        <div className="flex flex-1 flex-col">
          {rows.length === 0 ? (
            <p className="rounded-3xl bg-white p-10 text-center text-sm text-ink/55 ring-1 ring-ink/5">
              No flows match this filter.
            </p>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <p className="text-xs text-ink/40">Click any row to open the flow · shift+click a header to multi-sort</p>
              <div className="flex-1 overflow-hidden rounded-3xl ring-1 ring-ink/5" style={{ minHeight: 320, height: 0 }}>
                <AgGridReact<Flow>
                  rowData={rows}
                  columnDefs={colDefs}
                  defaultColDef={defaultColDef}
                  theme={themeQuartz}
                  onGridReady={onGridReady}
                  onRowClicked={onRowClicked}
                  rowSelection="single"
                  animateRows={true}
                  rowHeight={52}
                  headerHeight={44}
                  rowClass="cursor-pointer"
                  quickFilterText={quickFilter}
                  pagination={true}
                  paginationPageSize={20}
                  paginationPageSizeSelector={false}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* slide-over */}
      {openFlow && (
        <FlowPanel
          flow={openFlow}
          onClose={() => setOpenFlow(null)}
          refreshFlows={refreshFlows}
          onDelete={(id) => {
            setFlows((prev) => prev.filter((f) => f.id !== id));
            setOpenFlow(null);
          }}
        />
      )}
    </div>
  );
}
