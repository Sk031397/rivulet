"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Clock } from "lucide-react";
import { SUGGESTIONS, type Flow } from "@/data/dashboard";

interface BuildResponse {
  flow?: Flow;
  error?: string;
  message?: string;
  mode?: "paypal" | "ai";
  retryAfter?: number;
}

export default function PromptBox({ onBuild }: { onBuild?: (flow: Flow) => void }) {
  const [text, setText]       = useState("");
  const [building, setBuilding] = useState(false);
  const [error, setError]     = useState("");
  const [mode, setMode]       = useState("");
  const [countdown, setCountdown] = useState(0); // seconds remaining on rate-limit
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

  const build = async () => {
    if (!text.trim() || building || countdown > 0) return;
    setBuilding(true);
    setError("");
    setMode("");
    try {
      const res = await fetch("/api/build-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text.trim() }),
      });

      const data = (await res.json()) as BuildResponse;

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
      setMode(
        data.mode === "paypal"
          ? "✓ Built with AI · live PayPal resources created"
          : "✓ Built with AI",
      );
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
        ) : null}
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
