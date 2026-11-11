"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Check, Lock, Loader2 } from "lucide-react";
import type { PublicFlow } from "@/lib/publicFlow";
import { MIN_CONTRIBUTION, daysLeft, formatMoney, isPastDeadline, remainingFor, validateContribution } from "@/lib/contribution";

/* Minimal PayPal JS SDK typing for the parts we use. */
interface PayPalButtonsOptions {
  createOrder: () => string | Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
  onClick?: (
    data: unknown,
    actions: { resolve: () => Promise<void>; reject: () => Promise<void> },
  ) => Promise<void> | void;
}
interface PayPalSdk {
  Buttons: (opts: PayPalButtonsOptions) => { render: (el: HTMLElement) => Promise<void> };
}
declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

interface PayoutResult {
  label: string;
  /** Already masked by the server — safe to show as-is. */
  recipient: string;
  amount: number;
  ok: boolean;
  itemStatus?: string;
  error?: string;
}

interface CaptureResponse {
  flow?: PublicFlow;
  error?: string;
  captured?: number;
  alreadyRecorded?: boolean;
  autoDisburse?: boolean;
  payouts?: {
    attempted: number;
    disbursed: number;
    failed: number;
    results: PayoutResult[];
  };
}

/** Parse what the contributor typed ("$12.50", "1,000") into a number. */
const parseAmount = (raw: string) => Number(raw.replace(/[^\d.]/g, ""));

const PRESETS = [5, 10, 25, 50];

/** How long the thank-you / payout result stays visible before going to the flows page. */
const REDIRECT_MS = 4000;

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const id = String(params?.id ?? "");
  const [flow, setFlow] = useState<PublicFlow | null>(null);
  /** Amounts shown on this page, in the flow's own currency. */
  const money = (n: number) => formatMoney(n, flow?.currency);
  const currencySymbol = (() => {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency: flow?.currency ?? "USD" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? "$";
  })();
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [memberId, setMemberId] = useState("");
  const [paid, setPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [disburseResult, setDisburseResult] = useState<CaptureResponse["payouts"] | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  // The PayPal buttons are rendered once, so their callbacks read the latest
  // flow/amount through refs instead of closing over stale state.
  const flowRef = useRef<PublicFlow | null>(null);
  const amountRef = useRef("");
  const memberRef = useRef("");
  flowRef.current = flow;
  amountRef.current = amountInput;
  memberRef.current = memberId;

  /* Load the flow by id (public single-flow endpoint). */
  useEffect(() => {
    let alive = true;
    fetch(`/api/flows/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { flow?: PublicFlow }) => {
        if (!alive) return;
        setFlow(d.flow ?? null);
        if (d.flow) {
          const left = remainingFor(d.flow);
          // Group flows start on the person's own share; others on a sensible default.
          setAmountInput(String(Math.min(d.flow.share ?? 25, left) || ""));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Could not load this flow.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const remaining = flow ? remainingFor(flow) : 0;
  const expired = !!flow && flow.status === "Collecting" && isPastDeadline(flow);
  const refunded = !!flow && flow.status === "Refunded";
  const funded = !!flow && !refunded && !expired && (flow.status !== "Collecting" || remaining <= 0);
  const canPay = !!flow && !funded && !refunded && !expired && !paid;

  /* Render the PayPal button once the contributor can pay. */
  useEffect(() => {
    if (!canPay || renderedRef.current) return;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setError("PayPal checkout is not configured (missing NEXT_PUBLIC_PAYPAL_CLIENT_ID).");
      return;
    }

    const renderButtons = () => {
      if (!window.paypal || !btnRef.current || renderedRef.current) return;
      renderedRef.current = true;
      window.paypal.Buttons({
        // Block the PayPal popup if the amount isn't valid, with a clear message.
        onClick: (_data, actions) => {
          setError("");
          const current = flowRef.current;
          if (!current) return actions.reject();
          const check = validateContribution(current, parseAmount(amountRef.current));
          if (!check.ok) {
            setError(check.error);
            return actions.reject();
          }
          return actions.resolve();
        },
        // A fresh order per contributor, for exactly the amount they chose.
        createOrder: async () => {
          const res = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              flowId: flowRef.current?.id,
              amount: parseAmount(amountRef.current),
              ...(memberRef.current ? { memberId: memberRef.current } : {}),
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
          if (!res.ok || !data.orderId) {
            const message = data.error ?? "Could not start the PayPal payment.";
            setError(message);
            throw new Error(message);
          }
          return data.orderId;
        },
        onApprove: async (data) => {
          setCapturing(true);
          setError("");
          try {
            const res = await fetch("/api/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderID, flowId: flowRef.current?.id }),
            });
            const result = (await res.json()) as CaptureResponse;
            if (!res.ok) throw new Error(result.error ?? "Capture failed");
            if (result.flow) setFlow(result.flow);
            setDisburseResult(result.payouts ?? null);
            setPaidAmount(result.captured ?? 0);
            setPaid(true);
          } catch (e) {
            setError((e as Error).message ?? "Capture failed");
          } finally {
            setCapturing(false);
          }
        },
        onError: (err) => {
          console.error("[pay] PayPal error", err);
          // Keep a more specific message (set above) if there is one.
          setError((prev) => prev || "PayPal could not complete this payment. Try again.");
        },
      }).render(btnRef.current);
    };

    const scriptId = "paypal-sdk-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (window.paypal) {
      renderButtons();
    } else if (existing) {
      existing.addEventListener("load", renderButtons);
    } else {
      const s = document.createElement("script");
      s.id = scriptId;
      const currency = flowRef.current?.currency ?? "USD";
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
      s.async = true;
      s.onload = renderButtons;
      document.body.appendChild(s);
    }
  }, [canPay]);

  /* After a successful payment, show the result briefly, then go to the flows page.
     Only for signed-in users: the dashboard needs an account, so a contributor
     without one stays here on the thank-you screen instead of hitting sign-in. */
  useEffect(() => {
    if (!paid || !isLoaded || !isSignedIn) return;
    const t = setTimeout(() => router.push("/dashboard/flows"), REDIRECT_MS);
    return () => clearTimeout(t);
  }, [paid, isLoaded, isSignedIn, router]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 text-ink/60">
          <Loader2 className="size-5 animate-spin" /> Loading flow…
        </div>
      </Shell>
    );
  }

  if (!flow) {
    return (
      <Shell>
        <h1 className="text-2xl font-extrabold text-ink">Flow not found</h1>
        <p className="mt-2 text-sm text-ink/60">This payment link isn't valid or the flow was removed.</p>
      </Shell>
    );
  }

  const pct = Math.min(100, Math.round((flow.collected / flow.goal) * 100));
  const typed = parseAmount(amountInput);
  const presets = PRESETS.filter((p) => p < remaining);

  return (
    <Shell>
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-ultra">Rivulet</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">{flow.name}</h1>
        <p className="mt-2 text-ink/65">
          {refunded
            ? "This trip was cancelled."
            : flow.share
              ? `Your share is ${money(flow.share)} — split ${flow.participants} ways, securely with PayPal.`
              : "Chip in any amount, securely with PayPal."}
        </p>
        {flow.deadline && !refunded && (
          <p className="mt-2 inline-block rounded-full bg-saffron/25 px-3 py-1 text-xs font-bold text-amber-900">
            {expired
              ? `Closed ${flow.deadline}`
              : (() => {
                  const d = daysLeft(flow);
                  return d === 0 ? `Last day to pay · ${flow.deadline}` : `${d} day${d === 1 ? "" : "s"} left · pay by ${flow.deadline}`;
                })()}
          </p>
        )}
      </header>

      {/* progress */}
      <div className="mt-8">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-2xl font-extrabold text-ink">{money(flow.collected)}</span>
          <span className="text-sm font-semibold text-ink/55">of {money(flow.goal)} goal</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Funding progress"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${funded ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink/50">
          {refunded ? (
            "Everyone was refunded"
          ) : (
            <>
              {pct}% funded · {flow.contributors} {flow.contributors === 1 ? "payment" : "payments"}
              {flow.share && flow.participants
                ? ` · ${Math.min(flow.participants, Math.floor((flow.collected + 0.005) / flow.share))} of ${flow.participants} shares covered`
                : ""}
              {!funded && ` · ${money(remaining)} to go`}
            </>
          )}
        </p>
      </div>

      {/* who's in */}
      {flow.roster && flow.roster.length > 0 && !refunded && (
        <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Who has paid">
          {flow.roster.map((m) => (
            <li
              key={m.id}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                m.state === "paid" ? "bg-mint/25 text-emerald-800" : m.state === "partial" ? "bg-saffron/30 text-amber-900" : "bg-ink/8 text-ink/60"
              }`}
            >
              {m.state === "paid" && <Check className="size-3" />}
              {m.name}
            </li>
          ))}
        </ul>
      )}

      {/* checkout / status */}
      <div className="mt-8">
        {paid ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-mint/25 p-6 text-center">
              <Check className="mx-auto size-8 text-emerald-700" />
              <p className="mt-2 text-lg font-extrabold text-emerald-700">
                Thank you — {money(paidAmount)} received!
              </p>
              <p className="mt-1 text-sm text-ink/65">
                {flow.status === "Scheduled"
                  ? disburseResult && disburseResult.disbursed > 0
                    ? `Your contribution completed the goal. ${disburseResult.disbursed} payout${disburseResult.disbursed === 1 ? " was" : "s were"} sent now; the rest are scheduled for their release dates.`
                    : "Your contribution completed the goal. The payouts are scheduled and will be sent automatically on their release dates."
                  : disburseResult && disburseResult.disbursed > 0
                  ? `Your contribution completed the goal and triggered payouts to ${disburseResult.disbursed} recipient${disburseResult.disbursed === 1 ? "" : "s"}.`
                  : disburseResult
                    ? "Your contribution completed the goal. The organizer will release the payouts."
                    : funded && flow.status === "Needs approval"
                        ? "That completes the goal. The organizer will confirm the release conditions and then pay out."
                      : funded
                        ? "That completes the goal."
                        : `${money(remaining)} is still needed to reach the goal.`}
              </p>
              <p className="mt-3 text-xs font-semibold text-ink/50">
                {isSignedIn ? (
                  "Taking you to your flows…"
                ) : (
                  <Link href="/sign-up" className="text-ultra underline underline-offset-2 hover:text-ink">
                    Planning your own group trip? Create a flow
                  </Link>
                )}
              </p>
            </div>

            {/* Auto-disburse breakdown */}
            {disburseResult && disburseResult.attempted > 0 && (
              <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/8">
                <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-ink/50">
                  Payouts sent automatically
                </p>
                <ul className="space-y-2">
                  {disburseResult.results.map((r) => (
                    <li
                      key={r.label}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
                        r.ok ? "bg-mint/20" : "bg-coral/10"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{r.label}</p>
                        <p className="text-[11px] font-mono text-ink/55 truncate">{r.recipient}</p>
                        {r.ok
                          ? <p className="text-xs text-emerald-700">{money(r.amount)} · {r.itemStatus ?? "sent"}</p>
                          : <p className="text-xs text-coral truncate">{r.error ?? "failed"}</p>
                        }
                      </div>
                      {r.ok
                        ? <Check className="size-4 shrink-0 text-emerald-600" />
                        : <Lock className="size-4 shrink-0 text-coral" />
                      }
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : refunded ? (
          <div className="rounded-2xl bg-paper p-6 text-center ring-1 ring-ink/8">
            <Check className="mx-auto size-8 text-ink/50" />
            <p className="mt-2 text-lg font-extrabold text-ink">This flow was cancelled and refunded</p>
            <p className="mt-1 text-sm text-ink/60">Everyone who paid has been sent their money back through PayPal.</p>
          </div>
        ) : expired ? (
          <div className="rounded-2xl bg-paper p-6 text-center ring-1 ring-ink/8">
            <Lock className="mx-auto size-8 text-ink/50" />
            <p className="mt-2 text-lg font-extrabold text-ink">The deadline has passed</p>
            <p className="mt-1 text-sm text-ink/60">
              This flow didn't reach its goal in time, so it's closed. Money already paid in is returned to contributors.
            </p>
          </div>
        ) : funded ? (
          <div className="rounded-2xl bg-paper p-6 text-center ring-1 ring-ink/8">
            <Check className="mx-auto size-8 text-emerald-700" />
            <p className="mt-2 text-lg font-extrabold text-ink">This flow is fully funded</p>
            <p className="mt-1 text-sm text-ink/60">Thanks to all contributors — it's no longer accepting payments.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-ink/8">
              {flow.roster && flow.roster.length > 0 && (
                <div className="mb-4">
                  <p className="font-bold text-ink">Who are you?</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose your name">
                    {flow.roster.filter((m) => m.state !== "paid").map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={memberId === m.id}
                        onClick={() => {
                          setMemberId(m.id);
                          setAmountInput(String(Math.min(m.outstanding || flow.share || 25, remaining)));
                          setError("");
                        }}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition ${
                          memberId === m.id ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/10 hover:ring-ultra"
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={memberId === ""}
                      onClick={() => setMemberId("")}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition ${
                        memberId === "" ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/10 hover:ring-ultra"
                      }`}
                    >
                      Someone else
                    </button>
                  </div>
                </div>
              )}
              <label htmlFor="contribution" className="font-bold text-ink">Your contribution</label>
              <div className="mt-2 flex items-center rounded-2xl bg-white px-4 ring-1 ring-ink/10 focus-within:ring-2 focus-within:ring-ultra">
                <span className="text-ink/50">{currencySymbol}</span>
                <input
                  id="contribution"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => { setAmountInput(e.target.value); setError(""); }}
                  placeholder="25.00"
                  className="w-full bg-transparent px-2 py-3 text-xl font-extrabold text-ink outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {flow.share && flow.share < remaining && (
                  <button
                    type="button"
                    onClick={() => { setAmountInput(String(flow.share)); setError(""); }}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition ${
                      typed === flow.share ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/10 hover:ring-ultra"
                    }`}
                  >
                    My share · {money(flow.share)}
                  </button>
                )}
                {presets.filter((p) => p !== flow.share).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setAmountInput(String(p)); setError(""); }}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition ${
                      typed === p ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/10 hover:ring-ultra"
                    }`}
                  >
                    {formatMoney(p, flow.currency, "auto")}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setAmountInput(String(remaining)); setError(""); }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition ${
                    typed === remaining ? "bg-ink text-white ring-ink" : "bg-white text-ink/70 ring-ink/10 hover:ring-ultra"
                  }`}
                >
                  Cover the rest · {money(remaining)}
                </button>
              </div>
              <p className="mt-3 text-xs text-ink/55">
                Minimum {money(MIN_CONTRIBUTION)}. You'll confirm in PayPal before anything is charged.
              </p>
            </div>
            <div ref={btnRef} className="mt-4 min-h-[3.5rem]" />
            {capturing && <p className="mt-3 text-sm font-semibold text-ultra">Capturing payment…</p>}
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-coral">{error}</p>}
      </div>

      {/* payouts preview */}
      <div className="mt-8">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink/50">Where the money goes</p>
        <ul className="space-y-2">
          {flow.payouts.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-ink">{p.label}</p>
                {p.note && <p className="truncate text-[11px] text-ink/50">{p.note}</p>}
                {p.condition && p.state !== "paid" && (
                  <p className="mt-1 inline-block rounded-md bg-saffron/25 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                    Released when: {p.condition}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-extrabold text-ink">{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink antialiased">
      <div className="mx-auto max-w-lg px-6 py-16">{children}</div>
    </div>
  );
}
