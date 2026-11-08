"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Check, Lock, Loader2 } from "lucide-react";
import type { Flow } from "@/data/dashboard";

/* Minimal PayPal JS SDK typing for the parts we use. */
interface PayPalButtonsOptions {
  createOrder: () => string | Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
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
  recipient: string;
  amount: number;
  ok: boolean;
  batchId?: string;
  itemStatus?: string;
  error?: string;
}

interface CaptureResponse {
  flow?: Flow;
  error?: string;
  autoDisburse?: boolean;
  payouts?: {
    attempted: number;
    disbursed: number;
    failed: number;
    results: PayoutResult[];
  };
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Mask a payout recipient for the contributor-facing success screen so we
 * don't leak the owner's full routing address. Emails become "d•••@domain",
 * phones become "•••1234".
 */
const maskRecipient = (raw: string): string => {
  const v = (raw ?? "").trim();
  if (!v || v === "null") return "a recipient";
  if (v.includes("@")) {
    const [local, domain] = v.split("@");
    const head = local.slice(0, 1);
    return `${head}${"•".repeat(Math.max(1, Math.min(3, local.length - 1)))}@${domain}`;
  }
  const digits = v.replace(/\D/g, "");
  return `•••${digits.slice(-4)}`;
};

export default function PayPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [disburseResult, setDisburseResult] = useState<CaptureResponse["payouts"] | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  /* Load the flow by id (public single-flow endpoint). */
  useEffect(() => {
    let alive = true;
    fetch(`/api/flows/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { flow?: Flow; error?: string }) => {
        if (!alive) return;
        setFlow(d.flow ?? null);
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

  const orderResource = flow?.resources?.find((r) => r.kind === "PayPal Order");
  const funded = !!flow && flow.collected >= flow.goal;
  const canPay = !!orderResource?.id && !funded && !paid;

  /* Render the PayPal button once we have a live order. */
  useEffect(() => {
    if (!canPay || renderedRef.current) return;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setError("PayPal checkout is not configured (missing NEXT_PUBLIC_PAYPAL_CLIENT_ID).");
      return;
    }
    const orderId = orderResource!.id!;
    const flowId = flow!.id;

    const renderButtons = () => {
      if (!window.paypal || !btnRef.current || renderedRef.current) return;
      renderedRef.current = true;
      window.paypal.Buttons({
        // Reuse the order created at build time (stored in flow.resources).
        createOrder: () => orderId,
        onApprove: async (data) => {
          setCapturing(true);
          setError("");
          try {
            const res = await fetch("/api/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderID, flowId }),
            });
            const result = (await res.json()) as CaptureResponse;
            if (!res.ok) throw new Error(result.error ?? "Capture failed");
            if (result.flow) setFlow(result.flow);
            if (result.payouts) setDisburseResult(result.payouts);
            setPaid(true);
          } catch (e) {
            setError((e as Error).message ?? "Capture failed");
          } finally {
            setCapturing(false);
          }
        },
        onError: (err) => {
          console.error("[pay] PayPal error", err);
          setError("PayPal could not complete this payment. Try again.");
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
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD`;
      s.async = true;
      s.onload = renderButtons;
      document.body.appendChild(s);
    }
  }, [canPay, flow, orderResource]);

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

  return (
    <Shell>
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-ultra">Rivulet</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">{flow.name}</h1>
        <p className="mt-2 text-ink/65">Contribute securely with PayPal.</p>
      </header>

      {/* progress */}
      <div className="mt-8">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-2xl font-extrabold text-ink">{money(flow.collected)}</span>
          <span className="text-sm font-semibold text-ink/55">of {money(flow.goal)} goal</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full ${funded ? "bg-mint" : "bg-gradient-to-r from-ultra to-coral"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink/50">
          {pct}% funded · {flow.contributors} {flow.contributors === 1 ? "contributor" : "contributors"}
        </p>
      </div>

      {/* checkout / status */}
      <div className="mt-8">
        {paid ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-mint/25 p-6 text-center">
              <Check className="mx-auto size-8 text-emerald-700" />
              <p className="mt-2 text-lg font-extrabold text-emerald-700">Payment received — thank you!</p>
              <p className="mt-1 text-sm text-ink/65">
                {disburseResult && disburseResult.attempted > 0
                  ? `Your contribution triggered automatic payouts to ${disburseResult.disbursed} recipient${disburseResult.disbursed === 1 ? "" : "s"}.`
                  : "Your contribution has been captured successfully."}
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
                        <p className="text-[11px] font-mono text-ink/55 truncate">{maskRecipient(r.recipient)}</p>
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
        ) : funded ? (
          <div className="rounded-2xl bg-paper p-6 text-center ring-1 ring-ink/8">
            <Check className="mx-auto size-8 text-emerald-700" />
            <p className="mt-2 text-lg font-extrabold text-ink">This flow is fully funded</p>
            <p className="mt-1 text-sm text-ink/60">Thanks to all contributors — payouts have been sent automatically.</p>
          </div>
        ) : !orderResource?.id ? (
          <div className="rounded-2xl bg-paper p-6 text-center ring-1 ring-ink/8">
            <Lock className="mx-auto size-8 text-ink/40" />
            <p className="mt-2 text-lg font-extrabold text-ink">Checkout not available</p>
            <p className="mt-1 text-sm text-ink/60">This flow wasn't built with a live PayPal order.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-ink/8">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Your contribution</span>
                <span className="text-xl font-extrabold text-ink">{money(flow.goal)}</span>
              </div>
              <p className="mt-1 text-xs text-ink/55">Funds the full goal via PayPal.</p>
            </div>
            <div ref={btnRef} className="mt-4 min-h-[3.5rem]" />
            {capturing && <p className="mt-3 text-sm font-semibold text-ultra">Capturing payment…</p>}
            {error && <p className="mt-3 text-sm font-semibold text-coral">{error}</p>}
          </>
        )}
      </div>

      {/* payouts preview */}
      <div className="mt-8">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink/50">Where the money goes</p>
        <ul className="space-y-2">
          {flow.payouts.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-ink">{p.label}</p>
                {p.recipient && (
                  <p className="truncate text-[11px] font-mono text-ink/50">{p.recipient}</p>
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
