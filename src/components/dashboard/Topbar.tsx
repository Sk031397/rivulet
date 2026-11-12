"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { DEMO_PROFILE, useIsDemo } from "@/lib/demoClient";
import { Plus, Search, X, GitFork } from "lucide-react";
import type { Flow } from "@/data/dashboard";

/* ─── Search result type ─────────────────────────────────────────────── */
interface SearchResult {
  id: string;
  name: string;
  status: string;
}

/* read flows from localStorage (written by Overview page) */
function getStoredFlows(): Flow[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("rivulet-flows") ?? "[]") as Flow[];
  } catch { return []; }
}

/* ─── Search dropdown ────────────────────────────────────────────────── */
function SearchDropdown({
  query,
  results,
  onSelect,
  onClose,
}: {
  query: string;
  results: SearchResult[];
  onSelect: (r: SearchResult) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-2xl shadow-ink/20 ring-1 ring-ink/8">
      {results.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink/50">
          No results for &ldquo;<span className="font-semibold text-ink">{query}</span>&rdquo;
        </p>
      ) : (
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ultra/10 text-ultra">
                  <GitFork className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">{r.name}</p>
                  <p className="text-xs text-ink/50">{r.status}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Topbar ─────────────────────────────────────────────────────────── */
export default function Topbar() {
  const router = useRouter();
  const { user } = useUser();
  const isDemo = useIsDemo();
  const userName = user?.firstName ?? user?.fullName ?? user?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? (isDemo ? DEMO_PROFILE.firstName : "there");

  const [query, setQuery]           = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults]       = useState<SearchResult[]>([]);

  /* greeting by time of day */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  /* run search */
  const runSearch = useCallback((q: string) => {
    const term = q.trim().toLowerCase();
    if (!term) { setResults([]); setSearchOpen(false); return; }

    setResults(
      getStoredFlows()
        .filter((f) => f.name.toLowerCase().includes(term))
        .slice(0, 5)
        .map((f) => ({ id: f.id, name: f.name, status: f.status })),
    );
    setSearchOpen(true);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    runSearch(q);
  };

  const handleSelect = () => {
    setQuery("");
    setSearchOpen(false);
    router.push("/dashboard/flows");
  };

  const focusPromptBox = () => {
    const el = document.getElementById("flow-prompt");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus(), 300);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{greeting}, {userName}</h1>
        <p className="mt-1 text-sm text-ink/65">Here&apos;s your dashboard overview.</p>
      </div>

      <div className="flex items-center gap-3">

        {/* search */}
        <div className="relative hidden sm:block">
          <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm text-ink/60 shadow-sm ring-1 ring-ink/10 focus-within:ring-2 focus-within:ring-ultra">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => { if (query.trim()) setSearchOpen(true); }}
              onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setSearchOpen(false); } }}
              placeholder="Search flows"
              className="w-48 bg-transparent text-ink outline-none placeholder:text-ink/45"
              aria-label="Search flows"
              aria-expanded={searchOpen}
              aria-haspopup="listbox"
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} aria-label="Clear search">
                <X className="size-3.5 text-ink/40 hover:text-ink" />
              </button>
            )}
          </label>
          {searchOpen && query.trim() && (
            <SearchDropdown
              query={query}
              results={results}
              onSelect={handleSelect}
              onClose={() => setSearchOpen(false)}
            />
          )}
        </div>

        {/* new flow */}
        <button
          type="button"
          onClick={focusPromptBox}
          className="inline-flex items-center gap-2 rounded-full bg-ultra px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-ultra/25 transition hover:bg-ink"
        >
          <Plus className="size-4" /> New flow
        </button>

      </div>
    </div>
  );
}
