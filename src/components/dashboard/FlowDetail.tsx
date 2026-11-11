"use client";

import { useState } from "react";
import { Check, Clock, Lock, Users, Copy, X, ExternalLink, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StatusPill from "./StatusPill";
import { TripFacts, PayoutIssues } from "./TripControls";
import type { Flow, PayoutState } from "@/data/dashboard";
import { formatMoney } from "@/lib/contribution";

const STATE: Record<PayoutState, { icon: LucideIcon; label: string; chip: string; icon_bg: string }> = {
  paid: { icon: Check, label: "Paid", chip: "bg-mint/25 text-emerald-800", icon_bg: "bg-mint text-ink" },
  pending: { icon: Clock, label: "Pending", chip: "bg-saffron/30 text-amber-800", icon_bg: "bg-saffron text-ink" },
  locked: { icon: Lock, label: "On hold", chip: "bg-ink/10 text-ink", icon_bg: "bg-ink text-white" },
};

function ShareModal({ flowId, flowName, onClose }: { flowId: string; flowName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined"
    ? `${window.location.origin}/pay/${encodeURIComponent(flowId)}`
    : `https://rivulet.app/pay/${encodeURIComponent(flowId)}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Share flow" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        <div className="flex items-center justify-between bg-ink px-7 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Share</p>
            <h2 className="text-xl font-extrabold text-white">Your collect link</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-7 space-y-4">
          <p className="text-sm text-ink/65">Anyone with this link can contribute to <strong className="text-ink">{flowName}</strong>.</p>
          <div className="flex items-center gap-2 rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
            <span className="flex-1 truncate text-xs font-mono text-ink/60 select-all">{link}</span>
            <button
              type="button"
              onClick={copy}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${copied ? "bg-mint/25 text-emerald-700" : "bg-ink text-white hover:bg-ultra"}`}
            >
              {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
            </button>
          </div>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold text-ultra hover:text-ink transition"
          >
            <ExternalLink className="size-4" /> Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}

interface PayoutResult {
  label: string;
  recipient: string;
  amount: number;
  ok: boolean;
  batchId?: string;
  itemStatus?: string;
  error?: string;
}

interface ApproveResponse {
  flow?: Flow;
  payouts?: {
    attempted: number;
    disbursed: number;
    failed: number;
    results: PayoutResult[];
  };
  error?: string;
}

export default function FlowDetail({ flow, onDelete, onRename }: { flow: Flow; onDelete?: (flowId: string) => void; onRename?: (flowId: string, name: string) => void }) {
  const needsApproval = flow.status === "Needs approval";
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(flow.name);
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approveResult, setApproveResult] = useState<ApproveResponse["payouts"] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim() || saving) return;
                setSaving(true);
                try {
                  await fetch(`/api/flows/${encodeURIComponent(flow.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim() }),
                  });
                  onRename?.(flow.id, name.trim());
                } finally {
                  setSaving(false);
                  setEditing(false);
                }
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded-xl bg-paper px-3 py-1.5 text-lg font-extrabold text-ink outline-none ring-2 ring-ultra"
              />
              <button type="submit" disabled={saving} className="rounded-full bg-ultra px-3 py-1.5 text-xs font-bold text-white hover:bg-ink disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => { setName(flow.name); setEditing(false); }} className="rounded-full px-3 py-1.5 text-xs font-bold text-ink/60 hover:text-ink">
                Cancel
              </button>
            </form>
          ) : (
            <h2 className="text-lg font-extrabold text-ink">{name}</h2>
          )}
          <p className="mt-1 text-sm text-ink/65">
            ${flow.collected.toLocaleString()} collected from {flow.contributors} {flow.contributors === 1 ? "person" : "people"}
          </p>
        </div>
        <StatusPill status={flow.status} />
      </div>

      <div className="mt-4 space-y-3">
        <TripFacts flow={flow} />
        <PayoutIssues flow={flow} />
      </div>

      <div className="mx-auto mt-6 w-52 rounded-2xl bg-ink p-4 text-center text-white shadow-lg shadow-ink/25">
        <Users className="mx-auto size-5 text-saffron" />
        <p className="mt-1 text-xs font-semibold text-white/75">Collected</p>
        <p className="text-xl font-extrabold">${flow.collected.toLocaleString()}</p>
      </div>

      <svg aria-hidden="true" viewBox="0 0 300 36" className="mx-auto h-9 w-full max-w-md text-ultra/40">
        <path d="M150 0 V16 M50 36 V20 H250 V36 M150 16 V36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <ul className="grid gap-3 sm:grid-cols-3">
        {flow.payouts.map((p) => {
          const s = STATE[p.state];
          const Icon = s.icon;
          return (
            <li key={p.label} className="rounded-2xl bg-paper p-4">
              <div className="flex items-center justify-between">
                <span className={`grid size-8 place-items-center rounded-lg ${s.icon_bg}`}>
                  <Icon className="size-4" />
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.chip}`}>{s.label}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-ink">{p.label}</p>
              <p className="text-xl font-extrabold text-ink">{formatMoney(p.amount, flow.currency, "auto")}</p>
              <p className="mt-1 text-xs leading-snug text-ink/65">{p.note}</p>
              {p.condition && p.state !== "paid" && (
                <p className="mt-2 rounded-lg bg-saffron/25 px-2 py-1 text-[11px] font-semibold text-amber-900">
                  Release condition: {p.condition}
                </p>
              )}
              {p.recipient && (
                <p className="mt-2 truncate rounded-lg bg-ultra/10 px-2 py-1 text-[11px] font-mono text-ultra">
                  &#8594; {p.recipient}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {flow.resources && flow.resources.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-extrabold text-ink">PayPal resources</h3>
          <ul className="mt-2 space-y-2">
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

      <div className="mt-6 flex flex-wrap gap-3">
        {needsApproval && !approved && (
          <button
            type="button"
            disabled={approving}
            onClick={async () => {
              setApproving(true);
              setApproveError("");
              try {
                const res = await fetch("/api/flows/approve", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ flowId: flow.id }),
                });
                const data = (await res.json()) as ApproveResponse;
                if (!res.ok) {
                  // e.g. a payout is already running, or the flow isn't funded.
                  setApproveError(data.error ?? "Could not approve payouts.");
                } else {
                  setApproveResult(data.payouts ?? null);
                  setApproved(true);
                }
              } catch {
                setApproveError("Network error — check the Payments page before retrying.");
              } finally {
                setApproving(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ultra disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {approving
              ? <><Loader2 className="size-4 animate-spin" /> Sending payouts…</>
              : <><Check className="size-4" /> Approve payouts</>
            }
          </button>
        )}
        {approveError && (
          <p role="alert" className="w-full rounded-2xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            {approveError}
          </p>
        )}
        {approved && (
          <span className="inline-flex items-center gap-2 rounded-full bg-mint/25 px-5 py-2.5 text-sm font-bold text-emerald-700">
            <Check className="size-4" /> Payouts approved
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full px-5 py-2.5 text-sm font-bold text-ink ring-2 ring-ink/15 transition hover:ring-ink"
        >
          Edit name
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ultra/10 px-5 py-2.5 text-sm font-bold text-ultra transition hover:bg-ultra hover:text-white"
        >
          <Copy className="size-4" /> Share link
        </button>
        {confirmDelete ? (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-coral/10 px-4 py-2.5 text-sm font-bold text-coral">
            Delete this flow?
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch(`/api/flows/${encodeURIComponent(flow.id)}`, { method: "DELETE" });
                } catch { /* proceed optimistically */ }
                onDelete?.(flow.id);
              }}
              className="rounded-full bg-coral px-3 py-1 text-xs text-white hover:bg-coral/80"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-ink/60 hover:text-ink">
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-full px-4 py-2.5 text-sm font-bold text-ink/45 transition hover:text-coral"
          >
            Delete flow
          </button>
        )}
      </div>

      {shareOpen && <ShareModal flowId={flow.id} flowName={name} onClose={() => setShareOpen(false)} />}

      {/* Payout disbursement results */}
      {approveResult && (
        <div className="mt-5 rounded-2xl bg-paper p-5 ring-1 ring-ink/5">
          <p className="text-sm font-extrabold text-ink">
            Payout results · {approveResult.disbursed}/{approveResult.attempted} sent
          </p>
          <ul className="mt-3 space-y-2">
            {approveResult.results.map((r) => (
              <li key={r.label} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${r.ok ? "bg-mint/20" : "bg-coral/10"}`}>
                <div className="min-w-0">
                  <p className="font-bold text-ink truncate">{r.label} · <span className="font-mono text-xs">{r.recipient}</span></p>
                  {r.ok
                    ? <p className="text-xs text-emerald-700">Sent {formatMoney(r.amount, flow.currency)} · batch {r.batchId ?? "—"} · {r.itemStatus ?? "—"}</p>
                    : <p className="text-xs text-coral truncate">Failed: {r.error ?? "unknown error"}</p>
                  }
                </div>
                {r.ok
                  ? <Check className="size-4 shrink-0 text-emerald-600" />
                  : <X className="size-4 shrink-0 text-coral" />
                }
              </li>
            ))}
          </ul>
          {approveResult.attempted === 0 && (
            <p className="mt-2 text-xs text-ink/55">
              No recipient emails were set on this flow&apos;s payouts — status updated to Paid out but no PayPal payouts were sent. Add recipient emails when building a flow to enable automatic disbursement.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
