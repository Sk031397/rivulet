"use client";

/**
 * Owner-side controls for group-trip flows, shared by the Flows panel and the
 * overview: who's covered and when it's due, payouts PayPal reported a problem
 * with, and the "refund everyone" action. Everything shown comes from the flow.
 */

import { useState } from "react";
import { AlertTriangle, Bell, CalendarClock, Copy, Loader2, Undo2, UserPlus, Users, X } from "lucide-react";
import type { Flow } from "@/data/dashboard";
import { canRefund, daysLeft, isPastDeadline, paymentIssues, refundable, remainingFor, rosterStatus, shareFor } from "@/lib/contribution";

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Group size, per-person share, shares covered, and the deadline. Renders nothing for plain flows. */
export function TripFacts({ flow }: { flow: Flow }) {
  const share = shareFor(flow);
  if (share === null && !flow.deadline) return null;

  const covered = share ? Math.min(flow.participants ?? 0, Math.floor((flow.collected + 0.005) / share)) : 0;
  const left = daysLeft(flow);
  const closed = flow.status === "Collecting" && isPastDeadline(flow);

  return (
    <div className="flex flex-wrap gap-2">
      {share !== null && flow.participants && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ultra/10 px-3 py-1.5 text-xs font-bold text-ultra">
          <Users className="size-3.5" />
          {covered} of {flow.participants} shares covered · {money(share)} each
          {flow.status === "Collecting" && remainingFor(flow) > 0 ? ` · ${money(remainingFor(flow))} outstanding` : ""}
        </span>
      )}
      {flow.deadline && (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            closed ? "bg-coral/15 text-coral" : "bg-saffron/25 text-amber-900"
          }`}
        >
          <CalendarClock className="size-3.5" />
          {closed
            ? `Deadline passed (${flow.deadline})`
            : left === 0
              ? `Due today (${flow.deadline})`
              : left === null
                ? flow.deadline
                : `${left} day${left === 1 ? "" : "s"} left · due ${flow.deadline}`}
        </span>
      )}
    </div>
  );
}

/** Problems PayPal reported: payouts that failed, and payments that were disputed or reversed. */
export function PayoutIssues({ flow }: { flow: Flow }) {
  const issues = flow.payouts.filter((p) => p.issue);
  const paymentProblems = paymentIssues(flow);
  if (issues.length === 0 && paymentProblems.length === 0) return null;
  return (
    <div role="alert" className="rounded-2xl bg-coral/10 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-coral">
        <AlertTriangle className="size-4" /> PayPal reported a problem
      </p>
      <ul className="mt-2 space-y-1.5">
        {issues.map((p) => (
          <li key={p.id ?? p.label} className="text-sm text-ink/75">
            <strong className="text-ink">{p.label}</strong> ({money(p.amount)}): {p.issue} Fix the recipient, then approve again.
          </li>
        ))}
        {paymentProblems.map((c) => (
          <li key={c.id} className="text-sm text-ink/75">
            <strong className="text-ink">{c.payer ?? "A contributor"}</strong>&apos;s {money(c.amount)} payment: {c.issue}
            {flow.status === "Paid out" ? " This was already paid out, so you may now be short." : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RefundResponse {
  refunded?: number;
  failed?: number;
  amount?: number;
  error?: string;
}

/** "Refund everyone" with an explicit confirmation. Hidden when a refund isn't possible. */
export function RefundControl({ flow, onDone }: { flow: Flow; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const eligible = canRefund(flow).ok;
  if (!eligible && !message) return null;

  const total = refundable(flow).reduce((s, c) => s + c.amount, 0);

  const run = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/flows/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: flow.id }),
      });
      const data = (await res.json()) as RefundResponse;
      if (!res.ok || data.failed) {
        setIsError(true);
        setMessage(data.error ?? "Could not refund everyone.");
      } else {
        setIsError(false);
        setMessage(`Returned ${money(data.amount ?? 0)} to ${data.refunded} payment${data.refunded === 1 ? "" : "s"}.`);
      }
    } catch {
      setIsError(true);
      setMessage("Network error — check PayPal before retrying.");
    } finally {
      setBusy(false);
      setConfirming(false);
      onDone();
    }
  };

  return (
    <>
      {eligible && (confirming ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-5 py-2.5 text-sm font-bold text-coral">
          Return {money(total)} to everyone who paid?
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3 py-1 text-xs text-white hover:bg-coral/80 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : null} Refund
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="text-xs text-ink/60 hover:text-ink">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-ink ring-2 ring-ink/15 transition hover:ring-coral hover:text-coral"
        >
          <Undo2 className="size-4" /> Refund everyone
        </button>
      ))}
      {message && (
        <p role="status" className={`w-full text-sm font-semibold ${isError ? "text-coral" : "text-emerald-700"}`}>
          {message}
        </p>
      )}
    </>
  );
}

/* ─── Roster: who has paid ───────────────────────────────────────────── */

const CHIP: Record<"paid" | "partial" | "unpaid", string> = {
  paid: "bg-mint/25 text-emerald-800",
  partial: "bg-saffron/30 text-amber-900",
  unpaid: "bg-coral/15 text-coral",
};

/**
 * The named people in a group flow, with who has paid and who hasn't, an
 * add/remove form, and reminders. Status comes from the real contributions.
 */
export function RosterPanel({ flow, onChange }: { flow: Flow; onChange: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = rosterStatus(flow);
  const collecting = flow.status === "Collecting";
  // Only show for group-style flows (or ones that already have a list).
  if (status.length === 0 && !(collecting && flow.participants)) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/pay/${encodeURIComponent(flow.id)}` : "";
  const owing = status.filter((s) => s.state !== "paid" && s.outstanding > 0);

  const save = async (roster: Array<{ id?: string; name: string; email?: string }>) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(flow.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roster }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Could not save the list.");
        return false;
      }
      onChange();
      return true;
    } catch {
      setIsError(true);
      setMessage("Network error — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const current = () => (flow.roster ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email }));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    if (await save([...current(), { name: name.trim(), email: email.trim() || undefined }])) {
      setName("");
      setEmail("");
    }
  };

  const remove = (id: string) => save(current().filter((m) => m.id !== id));

  const remind = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/flows/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: flow.id }),
      });
      const data = (await res.json()) as { sent?: string[]; skipped?: Array<{ name: string; reason: string }>; error?: string };
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Could not send reminders.");
      } else {
        setIsError(false);
        const parts: string[] = [];
        if (data.sent?.length) parts.push(`Emailed ${data.sent.join(", ")}.`);
        if (data.skipped?.length) parts.push(`Skipped ${data.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`);
        setMessage(parts.join(" ") || "Nobody needed a reminder.");
        onChange();
      }
    } catch {
      setIsError(true);
      setMessage("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const who = owing.map((s) => `${s.name} ($${s.outstanding.toFixed(2)})`).join(", ");
    const due = flow.deadline ? ` by ${flow.deadline}` : "";
    const text = `${flow.name}: still waiting on ${who}. Please pay your share${due}: ${link}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const paidCount = status.filter((s) => s.state === "paid").length;

  return (
    <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50">Who&apos;s paid</p>
        {status.length > 0 && (
          <span className="text-xs font-bold text-ink/60">{paidCount} of {status.length}</span>
        )}
      </div>

      {status.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {status.map((s) => {
            const member = flow.roster?.find((m) => m.id === s.id);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                  {member?.email && <p className="truncate text-[11px] text-ink/50">{member.email}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-4 ${CHIP[s.state]}`}>
                    {s.state === "paid" ? "Paid" : s.state === "partial" ? `${money(s.outstanding)} left` : s.outstanding > 0 ? `Owes ${money(s.outstanding)}` : "Not paid"}
                  </span>
                  {collecting && s.paid === 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(s.id)}
                      aria-label={`Remove ${s.name}`}
                      className="grid size-6 place-items-center rounded-full text-ink/40 hover:bg-coral/10 hover:text-coral disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink/60">
          Add the people in your group to see who has paid. They&apos;ll pick their name on the pay page.
        </p>
      )}

      {collecting && (
        <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (for reminders)"
            aria-label="Email for reminders"
            type="email"
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-ultra disabled:opacity-50"
          >
            <UserPlus className="size-3.5" /> Add
          </button>
        </form>
      )}

      {collecting && owing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={remind}
            className="inline-flex items-center gap-1.5 rounded-full bg-ultra/10 px-4 py-2 text-xs font-bold text-ultra transition hover:bg-ultra hover:text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />} Remind {owing.length} {owing.length === 1 ? "person" : "people"}
          </button>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-ink ring-1 ring-ink/15 transition hover:ring-ink"
          >
            <Copy className="size-3.5" /> {copied ? "Copied!" : "Copy message for the group chat"}
          </button>
        </div>
      )}

      {message && (
        <p role="status" className={`mt-3 text-xs font-semibold ${isError ? "text-coral" : "text-emerald-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
