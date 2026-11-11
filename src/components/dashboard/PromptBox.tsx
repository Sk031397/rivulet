"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Clock, Search, ShieldCheck, Wand2, AlertTriangle, Paperclip, Loader2 } from "lucide-react";
import { SUGGESTIONS, type Flow } from "@/data/dashboard";
import { useAddressBook } from "@/lib/addressBook";
import type { AgentStep } from "@/lib/agent";
import { INVOICE_TYPES, MAX_INVOICE_BYTES } from "@/lib/invoiceLimits";
import type { Invoice } from "@/lib/invoice";
import { formatMoney } from "@/lib/contribution";

interface BuildResponse {
  flow?: Flow;
  error?: string;
  message?: string;
  retryAfter?: number;
  steps?: AgentStep[];
  warnings?: string[];
}

const STEP_ICON = { find_contacts: Search, check_recipient: ShieldCheck, create_flow: Wand2 } as const;

export default function PromptBox({ onBuild }: { onBuild?: (flow: Flow) => void }) {
  const [text, setText]       = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError]     = useState("");
  const [mode, setMode]       = useState("");
  const [countdown, setCountdown] = useState(0); // seconds remaining on rate-limit
  const [steps, setSteps]       = useState<AgentStep[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Saved + past-recipient contacts, so the agent can resolve "pay Maya" to an address.
  const { contacts } = useAddressBook();
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* pre-fill from "Use template" */
  useEffect(() => {
    const saved = sessionStorage.getItem("rivulet-template-prompt");
    if (saved) {
      setText(saved);
      sessionStorage.removeItem("rivulet-template-prompt");
      const el = document.getElementById("flow-prompt");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    }
  }, []);

  /* countdown ticker */
  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  /** Read a booking confirmation or invoice and fill the box with what it says, for the user to check. */
  const readInvoiceFile = async (file: File) => {
    setError("");
    setMode("");
    setInvoiceNote("");
    if (!(INVOICE_TYPES as readonly string[]).includes(file.type)) {
      setError("Attach a PNG, JPEG, WebP or PDF of the invoice.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      setError("That file is too large. Keep it under 2.5 MB.");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/read-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: file.type }),
      });
      const data = (await res.json()) as { invoice?: Invoice; prompt?: string; error?: string };
      if (!res.ok || !data.invoice || !data.prompt) throw new Error(data.error ?? "Couldn't read that invoice.");

      const inv = data.invoice;
      setText(data.prompt);
      const bits = [
        inv.payee ? `payee ${inv.payee}` : null,
        inv.total !== null ? `total ${formatMoney(inv.total, inv.currency, "auto")}` : null,
        inv.dueDate ? `due ${inv.dueDate}` : null,
      ].filter(Boolean);
      const warn = inv.itemsMatchTotal === false ? " The line items don't add up to the total, so check the amount." : "";
      setInvoiceNote(
        `Read from “${file.name}”: ${bits.join(", ") || "nothing clear"}.${warn} Check it, then add who's going and when everyone pays.`,
      );
    } catch (e) {
      setError((e as Error).message ?? "Couldn't read that invoice.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const build = async () => {
    if (!text.trim() || building || countdown > 0) return;
    setBuilding(true);
    setError("");
    setMode("");
    setSteps([]);
    setWarnings([]);
    try {
      const res = await fetch("/api/build-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text.trim(),
          contacts: contacts.map((c) => ({ name: c.name, address: c.address })),
        }),
      });

      const data = (await res.json()) as BuildResponse;
      // Show what the agent did even when it couldn't finish.
      setSteps(data.steps ?? []);
      setWarnings(data.warnings ?? []);

      /* rate limit — show countdown */
      if (res.status === 429) {
        const wait = data.retryAfter ?? 5;
        startCountdown(wait);
        setError(`rate_limit:${wait}`);
        return;
      }

      if (!res.ok) throw new Error(data.message ?? data.error ?? `Request failed (${res.status})`);
      if (!data.flow) throw new Error(data.error ?? "No flow returned");

      onBuild?.(data.flow);
      setMode("✓ Flow created — share its pay link from the Flows page.");
    } catch (e) {
      setError((e as Error).message ?? "Something went wrong");
    } finally {
      setBuilding(false);
    }
  };

  const isRateLimit = error.startsWith("rate_limit:");
  const blocked = building || countdown > 0;

  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-ink/10 ring-1 ring-ink/5">
      <div aria-hidden="true" className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-gradient-to-br from-ultra/25 to-coral/25 blur-2xl" />
      <label htmlFor="flow-prompt" className="flex items-center gap-2 text-sm font-extrabold text-ink">
        <Sparkles className="size-4 text-coral" /> Describe a new flow
      </label>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="flow-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !blocked) build(); }}
          disabled={blocked}
          placeholder="Collect $500 for a cleanup and pay volunteers once tasks are verified"
          className="flex-1 rounded-2xl bg-paper px-5 py-4 text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra disabled:opacity-60"
        />
        <button
          type="button"
          onClick={build}
          disabled={blocked}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-4 font-bold text-white transition hover:bg-ultra disabled:cursor-not-allowed disabled:opacity-60"
        >
          {building ? (
            "Building…"
          ) : countdown > 0 ? (
            <><Clock className="size-4" /> Retry in {countdown}s</>
          ) : (
            "Build flow"
          )}
        </button>
      </div>

      <div className="mt-3 min-h-[1.5rem] text-sm">
        {isRateLimit ? (
          <p className="flex items-center gap-2 font-semibold text-amber-700">
            <Clock className="size-4 shrink-0" />
            AWS Bedrock is busy &mdash; retrying in{" "}
            <span className="tabular-nums">{countdown}s</span>.
          </p>
        ) : error ? (
          <p className="font-semibold text-coral">{error}</p>
        ) : mode ? (
          <p className="font-semibold text-emerald-700">{mode}</p>
        ) : invoiceNote ? (
          <p className="font-semibold text-ultra">{invoiceNote}</p>
        ) : null}
      </div>

      <div className="mt-1 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          aria-label="Attach an invoice"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void readInvoiceFile(f); }}
        />
        <button
          type="button"
          disabled={blocked || reading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-ink/70 ring-1 ring-ink/15 transition hover:text-ink hover:ring-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reading ? <><Loader2 className="size-3.5 animate-spin" /> Reading invoice…</> : <><Paperclip className="size-3.5" /> Attach an invoice</>}
        </button>
        <span className="text-xs text-ink/45">PNG, JPEG, WebP or PDF. We read the payee and amount; you check it before building.</span>
      </div>

      {/* What the agent did, step by step */}
      <div aria-live="polite">
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1.5 rounded-2xl bg-saffron/20 p-3 ring-1 ring-saffron/40">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
        {steps.length > 0 && (
          <div className="mt-3 rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50">What the assistant did</p>
            <ol className="mt-2 space-y-1.5">
              {steps.map((s, i) => {
                const Icon = STEP_ICON[s.tool];
                // A lookup that finds nothing is normal, not an error; a rejected
                // plan is something the assistant then fixes.
                const tone = s.ok
                  ? "text-ink/80"
                  : s.tool === "find_contacts"
                    ? "text-ink/45"
                    : "text-amber-800";
                return (
                  <li key={i} className={`flex items-start gap-2 text-sm ${tone}`}>
                    <Icon className="mt-0.5 size-4 shrink-0" /> <span>{s.summary}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setText(s); setError(""); setMode(""); }}
            className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink/75 ring-1 ring-ink/10 transition hover:bg-ultra/10 hover:text-ultra"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
