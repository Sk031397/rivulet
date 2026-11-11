"use client";

/**
 * Owner-side controls for group-trip flows, shared by the Flows panel and the
 * overview: who's covered and when it's due, payouts PayPal reported a problem
 * with, and the "refund everyone" action. Everything shown comes from the flow.
 */

import { useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, Undo2, Users } from "lucide-react";
import type { Flow } from "@/data/dashboard";
import { canRefund, daysLeft, isPastDeadline, refundable, remainingFor, shareFor } from "@/lib/contribution";

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

/** Payouts PayPal later reported as failed, returned, held or unclaimed (set by the webhook). */
export function PayoutIssues({ flow }: { flow: Flow }) {
  const issues = flow.payouts.filter((p) => p.issue);
  if (issues.length === 0) return null;
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
