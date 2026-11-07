"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Download, ArrowDownLeft, ArrowUpRight, Loader2, X, Check, Search } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type GridReadyEvent,
  type RowClickedEvent,
  type GridApi,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import PageHeader from "@/components/dashboard/PageHeader";
import { type Payment, type PaymentStatus } from "@/data/dashboard";

// Register everything available in Community edition
ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

/* ── helpers ─────────────────────────────────────────────────────────── */
const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<PaymentStatus, string> = {
  completed: "bg-mint/25 text-emerald-800",
  pending:   "bg-saffron/30 text-amber-800",
  failed:    "bg-coral/15 text-coral",
};

const FILTERS = ["All", "In", "Out", "Pending"] as const;
type PaymentFilter = (typeof FILTERS)[number];

/* ── AG Grid cell renderers ──────────────────────────────────────────── */
function AmountCell({ value, data }: { value: number; data: Payment }) {
  const isIn = data?.direction === "in";
  return (
    <span className={`font-extrabold tabular-nums ${isIn ? "text-emerald-700" : "text-ink"}`}>
      {isIn ? "+" : "−"}{money(value)}
    </span>
  );
}

function DirectionCell({ data }: { data: Payment }) {
  const isIn = data?.direction === "in";
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
      isIn ? "bg-mint/25 text-emerald-800" : "bg-ultra/10 text-ultra"
    }`}>
      <Icon className="size-3" /> {isIn ? "In" : "Out"}
    </span>
  );
}

function StatusCell({ value }: { value: PaymentStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_STYLE[value] ?? ""}`}>
      {value}
    </span>
  );
}

/* ── Payment detail slide-over ───────────────────────────────────────── */
function PaymentDetail({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const isIn = payment.direction === "in";
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const rows = [
    { label: "Payment ID", value: payment.id },
    { label: "Date",       value: payment.date },
    { label: "Flow",       value: payment.flow },
    { label: "Who",        value: payment.who },
    { label: "Method",     value: payment.method },
    { label: "Direction",  value: isIn ? "Inbound (money in)" : "Outbound (payout)" },
    { label: "Status",     value: payment.status },
    { label: "Amount",     value: `${isIn ? "+" : "−"}${money(payment.amount)}` },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Payment details"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl shadow-ink/30"
      >
        <div className="flex items-center justify-between bg-ink px-6 py-5 shrink-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Payment details</p>
            <p className="mt-0.5 text-xl font-extrabold text-white">
              {isIn ? "+" : "−"}{money(payment.amount)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-ink/8 px-6 py-4 shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
            isIn ? "bg-mint/25 text-emerald-800" : "bg-ultra/10 text-ultra"
          }`}>
            <Icon className="size-4" /> {isIn ? "Money in" : "Money out"}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold capitalize ${STATUS_STYLE[payment.status]}`}>
            {payment.status}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="rounded-2xl bg-paper overflow-hidden ring-1 ring-ink/5">
            {rows.map((r, i) => (
              <div key={r.label} className={`flex items-start justify-between gap-4 px-5 py-3.5 ${i < rows.length - 1 ? "border-b border-ink/5" : ""}`}>
                <span className="text-sm font-semibold text-ink/50 shrink-0 w-28">{r.label}</span>
                <span className={`text-sm font-bold text-right break-all ${
                  r.label === "Amount" ? isIn ? "text-emerald-700" : "text-ink"
                  : r.label === "Payment ID" ? "font-mono text-xs text-ink/60"
                  : "text-ink"
                }`}>{r.value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink/50">Timeline</p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mint text-ink">
                  <Check className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">Payment initiated</p>
                  <p className="text-xs text-ink/55">{payment.date} via {payment.method}</p>
                </div>
              </li>
              {payment.status === "completed" && (
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mint text-ink">
                    <Check className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">Settled</p>
                    <p className="text-xs text-ink/55">Funds {isIn ? "received" : "disbursed"} successfully</p>
                  </div>
                </li>
              )}
              {payment.status === "pending" && (
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-saffron/40 text-amber-800">
                    <Loader2 className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">Awaiting settlement</p>
                    <p className="text-xs text-ink/55">PayPal is processing this transaction</p>
                  </div>
                </li>
              )}
              {payment.status === "failed" && (
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-coral/20 text-coral">
                    <X className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-coral">Failed</p>
                    <p className="text-xs text-ink/55">This transaction did not complete</p>
                  </div>
                </li>
              )}
            </ol>
          </div>
        </div>

        <div className="shrink-0 border-t border-ink/8 px-6 py-4">
          <button type="button" onClick={onClose}
            className="w-full rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-ultra">
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── main page ───────────────────────────────────────────────────────── */
const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function PaymentsPage() {
  const gridRef   = useRef<AgGridReact<Payment>>(null);
  const gridApi   = useRef<GridApi<Payment> | null>(null);

  const [filter, setFilter]       = useState<PaymentFilter>("All");
  const [payments, setPayments]   = useState<Payment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [mode, setMode]           = useState<string>("empty");
  const [selected, setSelected]   = useState<Payment | null>(null);
  const [quickFilter, setQuick]   = useState("");
  const [pageSize, setPageSize]   = useState<number>(25);

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

  useEffect(() => { fetchPayments(); }, [fetchPayments]);
  useEffect(() => {
    const id = setInterval(fetchPayments, 15_000);
    return () => clearInterval(id);
  }, [fetchPayments]);

  // Push quick-filter text into AG Grid whenever it changes
  useEffect(() => {
    gridApi.current?.setGridOption("quickFilterText", quickFilter);
  }, [quickFilter]);

  // Push page size into AG Grid whenever it changes
  useEffect(() => {
    gridApi.current?.setGridOption("paginationPageSize", pageSize);
  }, [pageSize]);

  const rows = useMemo<Payment[]>(() => {
    if (filter === "All") return payments;
    if (filter === "In")  return payments.filter((p) => p.direction === "in");
    if (filter === "Out") return payments.filter((p) => p.direction === "out");
    return payments.filter((p) => p.status === "pending");
  }, [payments, filter]);

  /* ── column definitions ─────────────────────────────────────────────── */
  const colDefs = useMemo<ColDef<Payment>[]>(() => [
    {
      field: "date",
      headerName: "Date",
      width: 130,
      sortable: true,
      filter: "agDateColumnFilter",
      pinned: "left",
    },
    {
      field: "flow",
      headerName: "Flow / Source",
      flex: 2,
      minWidth: 160,
      sortable: true,
      filter: "agTextColumnFilter",
      cellStyle: { fontWeight: 700 },
    },
    {
      field: "who",
      headerName: "Who",
      flex: 1,
      minWidth: 120,
      sortable: true,
      filter: "agTextColumnFilter",
    },
    {
      field: "direction",
      headerName: "Direction",
      width: 110,
      sortable: true,
      filter: "agTextColumnFilter",
      cellRenderer: DirectionCell,
    },
    {
      field: "method",
      headerName: "Method",
      width: 140,
      sortable: true,
      filter: "agTextColumnFilter",
    },
    {
      field: "amount",
      headerName: "Amount",
      width: 140,
      sortable: true,
      filter: "agNumberColumnFilter",
      cellRenderer: AmountCell,
      type: "rightAligned",
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      sortable: true,
      filter: "agTextColumnFilter",
      cellRenderer: StatusCell,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    suppressMovable: false,
    floatingFilter: true, // per-column filter inputs shown below headers
  }), []);

  const onGridReady = useCallback((e: GridReadyEvent<Payment>) => {
    gridApi.current = e.api;
    e.api.sizeColumnsToFit();
    e.api.setGridOption("paginationPageSize", pageSize);
  }, [pageSize]);

  const onRowClicked = useCallback((e: RowClickedEvent<Payment>) => {
    if (e.data) setSelected(e.data);
  }, []);

  /* ── summary numbers ─────────────────────────────────────────────────── */
  const totalIn      = payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const totalOut     = payments.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter((p) => p.status === "pending").length;

  const summary = [
    { label: "Money in",  value: money(totalIn),           note: `${payments.filter((p) => p.direction === "in").length} collections`,  tone: "text-emerald-700" },
    { label: "Money out", value: money(totalOut),           note: `${payments.filter((p) => p.direction === "out").length} payouts`,     tone: "text-ultra"       },
    { label: "Net flow",  value: money(totalIn - totalOut), note: "across all flows",                                                     tone: totalIn - totalOut >= 0 ? "text-emerald-700" : "text-coral" },
    { label: "Pending",   value: String(pendingCount),      note: pendingCount > 0 ? "awaiting settlement" : "all settled",               tone: pendingCount > 0 ? "text-coral" : "text-ink" },
  ];

  return (
    <>
      <PageHeader title="Payments" subtitle="Track money in and out across all your flows.">
        <button
          type="button"
          onClick={() => gridApi.current?.exportDataAsCsv({
            fileName: `rivulet-payments-${new Date().toISOString().slice(0, 10)}.csv`,
          })}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink shadow-sm ring-1 ring-ink/10 transition hover:ring-ultra disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </PageHeader>

      {/* Summary cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <p className="text-sm font-semibold text-ink/65">{s.label}</p>
            <p className={`mt-2 text-3xl font-extrabold tracking-tight ${s.tone}`}>{s.value}</p>
            <p className="mt-2 text-xs text-ink/60">{s.note}</p>
          </div>
        ))}
      </section>

      {/* Toolbar: filters + quick search + page size */}
      <div className="flex flex-wrap items-center gap-3">
        {/* direction/status filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count =
              f === "All"   ? payments.length
              : f === "In"  ? payments.filter((p) => p.direction === "in").length
              : f === "Out" ? payments.filter((p) => p.direction === "out").length
              : payments.filter((p) => p.status === "pending").length;
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

        {/* quick search */}
        <div className="relative ml-auto flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink/40 pointer-events-none" />
          <input
            type="search"
            value={quickFilter}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Search payments…"
            className="w-full rounded-2xl bg-white pl-9 pr-4 py-2 text-sm text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/40 focus:ring-2 focus:ring-ultra"
          />
        </div>

        {/* page size */}
        <div className="flex items-center gap-2 text-sm font-semibold text-ink/60">
          <span className="hidden sm:inline">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-3xl bg-white p-12 ring-1 ring-ink/5">
          <Loader2 className="size-5 animate-spin text-ultra" />
          <p className="text-sm font-semibold text-ink/60">Loading payments…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && payments.length === 0 && (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          <p className="text-xl font-extrabold text-ink">No payments yet</p>
          <p className="mt-2 text-sm text-ink/55">
            Payments appear here once contributors pay into a flow or you approve a payout.
          </p>
        </div>
      )}

      {/* No rows for active filter */}
      {!loading && payments.length > 0 && rows.length === 0 && (
        <p className="rounded-3xl bg-white p-10 text-center text-sm text-ink/55 ring-1 ring-ink/5">
          No payments match this filter.
        </p>
      )}

      {/* Data source + hint */}
      {!loading && payments.length > 0 && (
        <div className="flex items-center justify-between -mt-1">
          <p className="text-xs text-ink/40">Click any row for full details · drag columns to reorder · shift+click header to multi-sort</p>
          <p className="text-xs text-ink/35 shrink-0 ml-4">
            {mode === "paypal" ? "Live · PayPal" : mode === "flows" ? "Derived from flows" : ""}
          </p>
        </div>
      )}

      {/* AG Grid */}
      {!loading && rows.length > 0 && (
        <div className="overflow-hidden rounded-3xl ring-1 ring-ink/5" style={{ height: 520 }}>
          <AgGridReact<Payment>
            ref={gridRef}
            rowData={rows}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            theme={themeQuartz}
            onGridReady={onGridReady}
            onRowClicked={onRowClicked}
            /* pagination */
            pagination={true}
            paginationPageSize={pageSize}
            paginationPageSizeSelector={false}
            /* row selection */
            rowSelection="single"
            /* quick filter */
            quickFilterText={quickFilter}
            /* misc */
            animateRows={true}
            rowHeight={52}
            headerHeight={44}
            rowClass="cursor-pointer"
          />
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <PaymentDetail payment={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
