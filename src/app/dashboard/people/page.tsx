"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, X, Copy, Check, Mail, Link2, Search } from "lucide-react";
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
import { type Person, type PersonRole } from "@/data/dashboard";

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

/* ── helpers ─────────────────────────────────────────────────────────── */
const money = (n: number) => (n ? `$${n.toLocaleString()}` : "—");

const ROLE_STYLE: Record<PersonRole, string> = {
  Owner:       "bg-ultra/10 text-ultra",
  Contributor: "bg-mint/25 text-emerald-800",
  Recipient:   "bg-saffron/30 text-amber-800",
};

const ROLE_FILTERS = ["All", "Owner", "Contributor", "Recipient"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

/* ── AG Grid cell renderers ──────────────────────────────────────────── */
function AvatarCell({ data }: { data: Person }) {
  if (!data) return null;
  return (
    <div className="flex items-center gap-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${data.tone} text-xs font-extrabold text-white`}>
        {data.initials}
      </span>
      <span className="font-bold text-ink truncate">{data.name}</span>
    </div>
  );
}

function RoleCell({ value }: { value: PersonRole }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_STYLE[value] ?? ""}`}>
      {value}
    </span>
  );
}

function MoneyCell({ value }: { value: number }) {
  return <span className="tabular-nums font-bold text-ink">{money(value)}</span>;
}

function FlowsCell({ data }: { data: Person }) {
  if (!data) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {data.flows.slice(0, 2).map((f) => (
        <span key={f} className="rounded-lg bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink/70 ring-1 ring-ink/5">
          {f}
        </span>
      ))}
      {data.flows.length > 2 && (
        <span className="rounded-lg bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink/50 ring-1 ring-ink/5">
          +{data.flows.length - 2}
        </span>
      )}
    </div>
  );
}

/* ── Person detail slide-over ────────────────────────────────────────── */
function PersonDetail({ person, onClose }: { person: Person; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`Person: ${person.name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl shadow-ink/30">

        {/* header */}
        <div className="flex items-center justify-between bg-ink px-6 py-5 shrink-0">
          <div className="flex items-center gap-4">
            <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${person.tone} text-base font-extrabold text-white`}>
              {person.initials}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Person</p>
              <p className="text-xl font-extrabold text-white">{person.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        {/* role badge */}
        <div className="flex items-center gap-3 border-b border-ink/8 px-6 py-4 shrink-0">
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${ROLE_STYLE[person.role]}`}>
            {person.role}
          </span>
          <span className="text-sm text-ink/55">Member since {person.since}</span>
        </div>

        {/* stats */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-paper p-4">
              <p className="text-xs font-semibold text-ink/55">Total contributed</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">{money(person.contributed)}</p>
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <p className="text-xs font-semibold text-ink/55">Total received</p>
              <p className="mt-1 text-2xl font-extrabold text-ultra">{money(person.received)}</p>
            </div>
          </div>

          {/* flows */}
          <div>
            <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink/50">
              Flows ({person.flows.length})
            </p>
            {person.flows.length > 0 ? (
              <ul className="space-y-2">
                {person.flows.map((f) => (
                  <li key={f} className="rounded-2xl bg-paper px-4 py-3 text-sm font-semibold text-ink ring-1 ring-ink/5">
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink/45">Not part of any flows yet.</p>
            )}
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

/* ── Invite modal (unchanged) ────────────────────────────────────────── */
function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail]     = useState("");
  const [copied, setCopied]   = useState(false);
  const [sent, setSent]       = useState(false);
  const [sending, setSending] = useState(false);
  const link = "https://rivulet.app/join?ref=maya-rivulet";

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Invite failed");
      }
      setSent(true);
      setTimeout(() => { setSent(false); setEmail(""); }, 3000);
    } catch { /* leave email in place */ }
    finally { setSending(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Invite someone" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        <div className="flex items-center justify-between bg-ink px-7 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Invite</p>
            <h2 className="text-xl font-extrabold text-white">Bring someone in</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-7 space-y-6">
          <div>
            <p className="text-sm font-extrabold text-ink flex items-center gap-2">
              <Link2 className="size-4 text-ultra" /> Share your invite link
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
              <span className="flex-1 truncate text-xs text-ink/60 font-mono select-all">{link}</span>
              <button type="button" onClick={copyLink}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${copied ? "bg-mint/25 text-emerald-700" : "bg-ink text-white hover:bg-ultra"}`}>
                {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
          </div>
          <form onSubmit={sendInvite}>
            <p className="text-sm font-extrabold text-ink flex items-center gap-2">
              <Mail className="size-4 text-coral" /> Or send an email invite
            </p>
            <div className="mt-2 flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com" required
                className="flex-1 rounded-2xl bg-paper px-4 py-3 text-sm text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra" />
              <button type="submit" disabled={sending}
                className={`rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-60 ${sent ? "bg-mint/25 text-emerald-700" : "bg-ultra text-white hover:bg-ink"}`}>
                {sent ? "Sent!" : sending ? "Sending…" : "Send"}
              </button>
            </div>
            {sent && <p className="mt-2 text-xs font-semibold text-emerald-700">Invite sent to {email} 🎉</p>}
          </form>
          <p className="text-xs text-ink/45 text-center">Invited people can join any flow you share with them.</p>
        </div>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────── */
export default function PeoplePage() {
  const gridApi = useRef<GridApi<Person> | null>(null);

  const [people, setPeople]         = useState<Person[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [quickFilter, setQuick]     = useState("");
  const [selected, setSelected]     = useState<Person | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Derive people from flow contributors + payouts recipients
  const fetchPeople = useCallback(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d: { flows?: Array<{ id: string; name: string; contributors: number; payouts: Array<{ recipient?: string; amount: number; state: string }> }> }) => {
        if (!d.flows) return;
        const map = new Map<string, Person>();
        const tones = ["from-ultra to-coral", "from-mint to-ultra", "from-coral to-saffron", "from-ink to-ultra", "from-saffron to-coral"];

        d.flows.forEach((flow, fi) => {
          // Payout recipients
          flow.payouts.forEach((p, pi) => {
            if (!p.recipient) return;
            const key = p.recipient;
            const existing = map.get(key);
            if (existing) {
              existing.received += p.state === "paid" ? p.amount : 0;
              if (!existing.flows.includes(flow.name)) existing.flows.push(flow.name);
            } else {
              const name = p.recipient.split("@")[0];
              map.set(key, {
                name,
                initials: name.slice(0, 2).toUpperCase(),
                role: "Recipient",
                flows: [flow.name],
                contributed: 0,
                received: p.state === "paid" ? p.amount : 0,
                since: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                tone: tones[(fi + pi) % tones.length],
              });
            }
          });

          // Estimate contributors (no emails available, show placeholder rows)
          for (let i = 0; i < Math.min(flow.contributors, 3); i++) {
            const key = `contributor-${flow.id}-${i}`;
            const perContrib = flow.contributors > 0 ? Number((flow.payouts.reduce((s, p) => s + p.amount, 0) / flow.contributors).toFixed(2)) : 0;
            map.set(key, {
              name: `Contributor ${i + 1}`,
              initials: `C${i + 1}`,
              role: "Contributor",
              flows: [flow.name],
              contributed: perContrib,
              received: 0,
              since: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }),
              tone: tones[(fi + i + 1) % tones.length],
            });
          }
        });

        setPeople(Array.from(map.values()));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPeople(); }, [fetchPeople]);
  useEffect(() => {
    const id = setInterval(fetchPeople, 15_000);
    return () => clearInterval(id);
  }, [fetchPeople]);

  useEffect(() => {
    gridApi.current?.setGridOption("quickFilterText", quickFilter);
  }, [quickFilter]);

  const rows = useMemo<Person[]>(() => {
    if (roleFilter === "All") return people;
    return people.filter((p) => p.role === roleFilter);
  }, [people, roleFilter]);

  /* ── column definitions ─────────────────────────────────────────────── */
  const colDefs = useMemo<ColDef<Person>[]>(() => [
    {
      headerName: "Name",
      field: "name",
      flex: 2,
      minWidth: 160,
      sortable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: AvatarCell,
    },
    {
      field: "role",
      headerName: "Role",
      width: 130,
      sortable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: RoleCell,
    },
    {
      field: "contributed",
      headerName: "Contributed",
      width: 130,
      sortable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      cellRenderer: MoneyCell,
      type: "rightAligned",
    },
    {
      field: "received",
      headerName: "Received",
      width: 120,
      sortable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      cellRenderer: MoneyCell,
      type: "rightAligned",
    },
    {
      headerName: "Flows",
      flex: 2,
      minWidth: 160,
      sortable: false,
      cellRenderer: FlowsCell,
    },
    {
      field: "since",
      headerName: "Since",
      width: 120,
      sortable: true,
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    suppressMovable: false,
  }), []);

  const onGridReady = useCallback((e: GridReadyEvent<Person>) => {
    gridApi.current = e.api;
    e.api.sizeColumnsToFit();
  }, []);

  const onRowClicked = useCallback((e: RowClickedEvent<Person>) => {
    if (e.data) setSelected(e.data);
  }, []);

  return (
    <>
      <PageHeader title="People" subtitle="Contributors and recipients across your flows.">
        <button type="button" onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ultra px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-ultra/25 transition hover:bg-ink">
          <Plus className="size-4" /> Invite
        </button>
      </PageHeader>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* role filters */}
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((f) => {
            const count = f === "All" ? people.length : people.filter((p) => p.role === f).length;
            const active = roleFilter === f;
            return (
              <button key={f} type="button" onClick={() => setRoleFilter(f)}
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
            placeholder="Search people…"
            className="w-full rounded-2xl bg-white pl-9 pr-4 py-2 text-sm text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/40 focus:ring-2 focus:ring-ultra" />
        </div>
      </div>

      {/* empty state */}
      {people.length === 0 && (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          <p className="text-xl font-extrabold text-ink">No people yet</p>
          <p className="mt-2 text-sm text-ink/55">
            People who contribute to or receive from your flows will appear here automatically.
            Invite someone to get started.
          </p>
          <button type="button" onClick={() => setInviteOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink">
            <Plus className="size-4" /> Invite someone
          </button>
        </div>
      )}

      {/* AG Grid */}
      {people.length > 0 && (
        <>
          {rows.length === 0 ? (
            <p className="rounded-3xl bg-white p-10 text-center text-sm text-ink/55 ring-1 ring-ink/5">
              No people match this filter.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink/40">Click any row to view details · people are derived from your flows</p>
              <div className="overflow-hidden rounded-3xl ring-1 ring-ink/5"
                style={{ height: Math.min(600, 56 + rows.length * 56) }}>
                <AgGridReact<Person>
                  rowData={rows}
                  columnDefs={colDefs}
                  defaultColDef={defaultColDef}
                  theme={themeQuartz}
                  onGridReady={onGridReady}
                  onRowClicked={onRowClicked}
                  rowSelection="single"
                  animateRows={true}
                  rowHeight={56}
                  headerHeight={44}
                  rowClass="cursor-pointer"
                  quickFilterText={quickFilter}
                  pagination={rows.length > 20}
                  paginationPageSize={20}
                  paginationPageSizeSelector={false}
                />
              </div>
            </>
          )}
        </>
      )}

      {selected && <PersonDetail person={selected} onClose={() => setSelected(null)} />}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </>
  );
}
