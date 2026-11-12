"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  type GetRowIdParams,
} from "ag-grid-community";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, BarChart3, Loader2 } from "lucide-react";
import { type Payment } from "@/data/dashboard";
import { rivuletTheme, LIVE_GRID_OPTIONS } from "@/lib/gridTheme";
import { setPinnedTotals, sumMoney } from "@/lib/gridHelpers";

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

/* ── helpers ─────────────────────────────────────────────────────────── */
const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A per-flow aggregate row for the analytics grid. */
interface FlowAgg {
  flow: string;
  collected: number;
  paidOut: number;
  net: number;
  count: number;
  contributors: number;
}

/** One day bucket for the trend chart. */
interface DayBucket {
  key: string;
  ts: number;
  label: string;
  inAmt: number;
  outAmt: number;
}

/* ── trend chart (dependency-free SVG) ───────────────────────────────── */
function TrendChart({ data }: { data: DayBucket[] }) {
  if (data.length === 0) return null;

  const W = 640;
  const H = 180;
  const PAD = 8;
  const LABEL = 20; // room under the baseline for the day labels (they were being clipped)
  const base = H - PAD - LABEL; // y of the baseline
  const max = Math.max(1, ...data.map((d) => Math.max(d.inAmt, d.outAmt)));
  const slot = (W - PAD * 2) / data.length;
  const barW = Math.min(16, slot / 3);

  const y = (v: number) => base - (v / max) * (base - PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Money in versus money out by day">
      {/* baseline */}
      <line x1={PAD} y1={base} x2={W - PAD} y2={base} className="stroke-ink/10" strokeWidth={1} />
      {data.map((d, i) => {
        const cx = PAD + slot * i + slot / 2;
        return (
          <g key={d.key}>
            {/* money in */}
            <rect
              x={cx - barW - 1}
              y={y(d.inAmt)}
              width={barW}
              height={Math.max(0, base - y(d.inAmt))}
              rx={3}
              className="fill-emerald-500/80"
            >
              <title>{`${d.label} · in ${money(d.inAmt)}`}</title>
            </rect>
            {/* money out */}
            <rect
              x={cx + 1}
              y={y(d.outAmt)}
              width={barW}
              height={Math.max(0, base - y(d.outAmt))}
              rx={3}
              className="fill-ultra/80"
            >
              <title>{`${d.label} · out ${money(d.outAmt)}`}</title>
            </rect>
            {/* day label */}
            <text x={cx} y={base + 15} textAnchor="middle" className="fill-ink/40 text-[9px]">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── AG Grid cell renderers ──────────────────────────────────────────── */
function MoneyCell({ value }: { value: number }) {
  return <span className="tabular-nums font-semibold text-ink">{money(value)}</span>;
}

function NetCell({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold tabular-nums ${positive ? "text-emerald-700" : "text-coral"}`}>
      {positive ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
      {positive ? "+" : "−"}{money(Math.abs(value))}
    </span>
  );
}

/* ── component ───────────────────────────────────────────────────────── */
export default function AnalyticsPanel() {
  const gridApi = useRef<GridApi<FlowAgg> | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<string>("empty");

  const fetchPayments = useCallback(() => {
    fetch("/api/payments")
      .then((r) => r.json())
      .then((d: { payments?: Payment[]; mode?: string }) => {
        if (d.payments) setPayments(d.payments);
        if (d.mode) setMode(d.mode);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPayments();
    const id = setInterval(fetchPayments, 15_000);
    return () => clearInterval(id);
  }, [fetchPayments]);

  /* summary numbers */
  const { totalIn, totalOut, net } = useMemo(() => {
    const totalIn = payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
    const totalOut = payments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [payments]);

  /* daily trend buckets — chronological, most recent 10 days */
  const trend = useMemo<DayBucket[]>(() => {
    const byDay = new Map<string, DayBucket>();
    for (const p of payments) {
      // p.date is a pre-formatted string like "Nov 7, 2026"; parse to a
      // timestamp so we can bucket and sort by actual calendar day.
      const parsed = new Date(p.date);
      const ts = Number.isNaN(parsed.getTime()) ? 0 : parsed.setHours(0, 0, 0, 0);
      const key = String(ts);
      const label = Number.isNaN(parsed.getTime())
        ? p.date
        : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const b = byDay.get(key) ?? { key, ts, label, inAmt: 0, outAmt: 0 };
      if (p.direction === "in") b.inAmt += p.amount;
      else b.outAmt += p.amount;
      byDay.set(key, b);
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.ts - b.ts) // oldest → newest
      .slice(-10); // keep the 10 most recent days
  }, [payments]);

  /* per-flow aggregates for the analytics grid */
  const flowRows = useMemo<FlowAgg[]>(() => {
    const byFlow = new Map<string, FlowAgg>();
    const seenWho = new Map<string, Set<string>>();
    for (const p of payments) {
      const row = byFlow.get(p.flow) ?? { flow: p.flow, collected: 0, paidOut: 0, net: 0, count: 0, contributors: 0 };
      if (p.direction === "in") row.collected += p.amount;
      else row.paidOut += p.amount;
      row.count += 1;
      byFlow.set(p.flow, row);

      const who = seenWho.get(p.flow) ?? new Set<string>();
      if (p.who) who.add(p.who);
      seenWho.set(p.flow, who);
    }
    return Array.from(byFlow.values())
      .map((r) => ({ ...r, net: r.collected - r.paidOut, contributors: seenWho.get(r.flow)?.size ?? 0 }))
      .sort((a, b) => b.collected - a.collected);
  }, [payments]);

  const colDefs = useMemo<ColDef<FlowAgg>[]>(() => [
    { field: "flow", headerName: "Flow / Source", flex: 2, minWidth: 180, sortable: true, filter: "agTextColumnFilter", cellStyle: { fontWeight: 700 }, pinned: "left" },
    { field: "collected", headerName: "Collected", width: 140, sortable: true, filter: "agNumberColumnFilter", type: "rightAligned", cellRenderer: MoneyCell },
    { field: "paidOut", headerName: "Paid out", width: 140, sortable: true, filter: "agNumberColumnFilter", type: "rightAligned", cellRenderer: MoneyCell },
    { field: "net", headerName: "Net", width: 150, sortable: true, filter: "agNumberColumnFilter", type: "rightAligned", cellRenderer: NetCell, sort: "desc" },
    { field: "count", headerName: "Txns", width: 90, sortable: true, filter: "agNumberColumnFilter", type: "rightAligned" },
    { field: "contributors", headerName: "People", width: 100, sortable: true, filter: "agNumberColumnFilter", type: "rightAligned", valueFormatter: (p) => (p.node?.rowPinned ? "" : String(p.value ?? "")) },
  ], []);

  const defaultColDef = useMemo<ColDef>(
    // Live polling: a cell whose value changed glows briefly.
    () => ({ resizable: true, suppressMovable: false, enableCellChangeFlash: true }),
    [],
  );

  /** Stable ids let polling update rows in place instead of replacing the table. */
  const getRowId = useCallback((p: GetRowIdParams<FlowAgg>) => p.data.flow, []);

  /** Totals across the flows that pass the current filters. */
  const refreshTotals = useCallback(() => {
    if (!gridApi.current) return;
    setPinnedTotals(gridApi.current, (rows) => ({
      flow: `Total · ${rows.length} flow${rows.length === 1 ? "" : "s"}`,
      collected: sumMoney(rows.map((r) => r.collected)),
      paidOut: sumMoney(rows.map((r) => r.paidOut)),
      net: sumMoney(rows.map((r) => r.net)),
      count: rows.reduce((s, r) => s + r.count, 0),
      // People can overlap between flows, so a sum would double count.
      contributors: 0,
    }));
  }, []);

  const onGridReady = useCallback((e: GridReadyEvent<FlowAgg>) => {
    gridApi.current = e.api;
    e.api.sizeColumnsToFit();
    refreshTotals();
  }, [refreshTotals]);

  if (loading) {
    return (
      <section className="flex items-center justify-center gap-3 rounded-3xl bg-white p-12 ring-1 ring-ink/5">
        <Loader2 className="size-5 animate-spin text-ultra" />
        <p className="text-sm font-semibold text-ink/60">Loading analytics…</p>
      </section>
    );
  }

  if (payments.length === 0) {
    // A slim hint instead of a big empty card, so flows sit higher on the page.
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 ring-1 ring-ink/5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-paper text-ink/40">
          <BarChart3 className="size-4" />
        </span>
        <p className="text-sm text-ink/55">
          <span className="font-semibold text-ink/70">Analytics</span> appear here once your flows start moving money.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Trend card */}
      <div className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <TrendingUp className="size-5 text-ultra" /> Money flow
            </h2>
            <p className="mt-0.5 text-xs text-ink/50">Inbound vs outbound across recent activity</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="size-2.5 rounded-sm bg-emerald-500/80" /> In</span>
            <span className="inline-flex items-center gap-1.5 text-ultra"><span className="size-2.5 rounded-sm bg-ultra/80" /> Out</span>
          </div>
        </div>

        {/* mini KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-mint/15 p-3">
            <p className="text-[11px] font-semibold text-emerald-800/70">Total in</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-emerald-700">{money(totalIn)}</p>
          </div>
          <div className="rounded-2xl bg-ultra/10 p-3">
            <p className="text-[11px] font-semibold text-ultra/70">Total out</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-ultra">{money(totalOut)}</p>
          </div>
          <div className={`rounded-2xl p-3 ${net >= 0 ? "bg-saffron/20" : "bg-coral/10"}`}>
            <p className={`text-[11px] font-semibold ${net >= 0 ? "text-amber-800/70" : "text-coral/70"}`}>Net</p>
            <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${net >= 0 ? "text-amber-700" : "text-coral"}`}>
              {net >= 0 ? "+" : "−"}{money(Math.abs(net))}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <TrendChart data={trend} />
        </div>
      </div>

      {/* Per-flow analytics grid */}
      <div className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <BarChart3 className="size-5 text-coral" /> Breakdown by flow
            </h2>
            <p className="mt-0.5 text-xs text-ink/50">
              Sort and filter per-flow performance · {mode === "paypal" ? "Live · PayPal" : "Derived from flows"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => gridApi.current?.exportDataAsCsv({ fileName: `rivulet-flow-breakdown-${new Date().toISOString().slice(0, 10)}.csv`, skipPinnedBottom: true })}
            className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ink ring-1 ring-ink/10 transition hover:ring-ultra"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-ink/5" style={{ height: 340 }}>
          <AgGridReact<FlowAgg>
            rowData={flowRows}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            theme={rivuletTheme}
            getRowId={getRowId}
            {...LIVE_GRID_OPTIONS}
            onGridReady={onGridReady}
            onRowDataUpdated={refreshTotals}
            onFilterChanged={refreshTotals}
            rowHeight={48}
            headerHeight={42}
          />
        </div>
      </div>
    </section>
  );
}
