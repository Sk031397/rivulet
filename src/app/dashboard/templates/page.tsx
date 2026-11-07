"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { TEMPLATES } from "@/data/dashboard";

const CATEGORIES = ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

export default function TemplatesPage() {
  const router = useRouter();
  const [category, setCategory] = useState<string>("All");
  const templates = category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  const useTemplate = (description: string) => {
    // Store the prompt in sessionStorage so the dashboard PromptBox can pick it up
    sessionStorage.setItem("rivulet-template-prompt", description);
    router.push("/dashboard");
  };

  return (
    <>
      <PageHeader title="Templates" subtitle="Start from a proven flow. Customize anything.">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-ink/70 shadow-sm ring-1 ring-ink/10">
          <Sparkles className="size-4 text-coral" /> {TEMPLATES.length} templates
        </span>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${active ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/10 hover:text-ink"}`}>
              {c}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const Icon = t.icon as LucideIcon;
          return (
            <article key={t.name} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-ink/5 transition hover:ring-ultra/40">
              <div className="flex items-start justify-between">
                <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${t.tone} text-white shadow-md`}>
                  <Icon className="size-6" />
                </span>
                <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-ink/70 ring-1 ring-ink/5">{t.category}</span>
              </div>

              <h3 className="mt-4 text-lg font-extrabold text-ink">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-ink/65">{t.description}</p>

              <div className="mt-4 flex items-center gap-4 text-xs text-ink/55">
                <span><strong className="text-ink">{t.payouts}</strong> payouts</span>
              </div>

              <button
                type="button"
                onClick={() => useTemplate(t.description)}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-ink ring-1 ring-ink/10 transition hover:bg-ultra hover:text-white"
              >
                Use template <ArrowRight className="size-4" />
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
