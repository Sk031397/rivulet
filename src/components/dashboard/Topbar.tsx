"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Bell, Plus, Search, X, GitFork, Users, Check, Info, AlertCircle } from "lucide-react";
import type { Flow } from "@/data/dashboard";

/* ─── Notification types ─────────────────────────────────────────────── */
interface Notification {
  id: string;
  icon: "info" | "success" | "warning";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: "n1", icon: "info", title: "Welcome to Rivulet", body: "Build your first flow with the prompt box below.", time: "Just now", read: false },
];

const NOTIF_ICON: Record<Notification["icon"], { el: typeof Info; bg: string; color: string }> = {
  info:    { el: Info,        bg: "bg-ultra/10",   color: "text-ultra"        },
  success: { el: Check,       bg: "bg-mint/25",    color: "text-emerald-700"  },
  warning: { el: AlertCircle, bg: "bg-saffron/30", color: "text-amber-700"    },
};

/* ─── Search result types ────────────────────────────────────────────── */
type SearchResult =
  | { kind: "flow";   id: string; name: string; status: string }
  | { kind: "person"; name: string; role: string };

/* read flows from localStorage (written by Overview page) */
function getStoredFlows(): Flow[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("rivulet-flows") ?? "[]") as Flow[];
  } catch { return []; }
}

/* ─── Notifications panel ────────────────────────────────────────────── */
function NotifPanel({
  notifications,
  onRead,
  onDismiss,
  onClose,
}: {
  notifications: Notification[];
  onRead: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  
  /* mark as read once on mount */
  useEffect(() => {
    onRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* click outside to close */
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/20 ring-1 ring-ink/8"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink/5">
        <p className="font-extrabold text-ink">Notifications</p>
        {notifications.length > 0 && (
          <button type="button" onClick={() => notifications.forEach(n => onDismiss(n.id))}
            className="text-xs font-bold text-ink/50 hover:text-ultra transition">
            Clear all
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Check className="mx-auto size-8 text-ink/20" />
          <p className="mt-2 text-sm font-semibold text-ink/40">You&apos;re all caught up</p>
        </div>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y divide-ink/5">
          {notifications.map((n) => {
            const cfg = NOTIF_ICON[n.icon];
            const Icon = cfg.el;
            return (
              <li key={n.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-paper/60 transition">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${cfg.bg}`}>
                  <Icon className={`size-4 ${cfg.color}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink leading-snug">{n.title}</p>
                  <p className="text-xs text-ink/60 mt-0.5 leading-snug">{n.body}</p>
                  <p className="text-[11px] text-ink/40 mt-1">{n.time}</p>
                </div>
                <button type="button" onClick={() => onDismiss(n.id)}
                  aria-label="Dismiss"
                  className="mt-0.5 shrink-0 grid size-6 place-items-center rounded-full text-ink/30 hover:bg-ink/10 hover:text-ink transition">
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper"
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.kind === "flow" ? "bg-ultra/10 text-ultra" : "bg-mint/20 text-emerald-700"}`}>
                  {r.kind === "flow" ? <GitFork className="size-4" /> : <Users className="size-4" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">{r.name}</p>
                  <p className="text-xs text-ink/50 capitalize">
                    {r.kind === "flow" ? (r as { kind: "flow"; status: string }).status : (r as { kind: "person"; role: string }).role}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink/50 ring-1 ring-ink/8 capitalize">
                  {r.kind}
                </span>
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
  const userName = user?.firstName ?? user?.fullName ?? user?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "there";

  const [query, setQuery]           = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const notifRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  /* greeting by time of day */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  /* run search */
  const runSearch = useCallback((q: string) => {
    const term = q.trim().toLowerCase();
    if (!term) { setResults([]); setSearchOpen(false); return; }

    const flows = getStoredFlows();
    const flowResults: SearchResult[] = flows
      .filter((f) => f.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map((f) => ({ kind: "flow", id: f.id, name: f.name, status: f.status }));

    // People — in a real app this would query an API; for now search is flow-only
    // unless we have a stored people list
    let peopleResults: SearchResult[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem("rivulet-people") ?? "[]") as Array<{ name: string; role: string }>;
      peopleResults = stored
        .filter((p) => p.name.toLowerCase().includes(term))
        .slice(0, 3)
        .map((p) => ({ kind: "person", name: p.name, role: p.role }));
    } catch { /* ignore */ }

    const all = [...flowResults, ...peopleResults];
    setResults(all);
    setSearchOpen(true);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    runSearch(q);
  };

  const handleSelect = (r: SearchResult) => {
    setQuery("");
    setSearchOpen(false);
    if (r.kind === "flow") {
      router.push("/dashboard/flows");
    } else {
      router.push("/dashboard/people");
    }
  };

  const focusPromptBox = () => {
    const el = document.getElementById("flow-prompt");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus(), 300);
    }
  };

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

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
              placeholder="Search flows and people"
              className="w-48 bg-transparent text-ink outline-none placeholder:text-ink/45"
              aria-label="Search flows and people"
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

        {/* notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
            onClick={() => setNotifOpen((v) => !v)}
            className="relative grid size-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-ink/10 transition hover:ring-ultra"
          >
            <Bell className="size-5 text-ink" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-extrabold leading-[18px] text-white shadow"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <NotifPanel
              notifications={notifications}
              onRead={markAllRead}
              onDismiss={dismiss}
              onClose={() => setNotifOpen(false)}
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
