"use client";

import { useState } from "react";
import { Search, Plus, X, Copy, Check, Mail, Link2 } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { type Person, type PersonRole } from "@/data/dashboard";

const money = (n: number) => (n ? `$${n.toLocaleString()}` : "—");

const ROLE: Record<PersonRole, string> = {
  Owner:       "bg-ultra/10 text-ultra",
  Contributor: "bg-mint/25 text-emerald-800",
  Recipient:   "bg-saffron/30 text-amber-800",
};

const ALL_PEOPLE: Person[] = [];

const INVITE_LINK = typeof window !== "undefined"
  ? `${window.location.origin}/join?ref=maya-rivulet`
  : "https://rivulet.app/join?ref=maya-rivulet";

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const link = "https://rivulet.app/join?ref=maya-rivulet";

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // In production this would POST to an API; here we show a success state
    setSent(true);
    setTimeout(() => { setSent(false); setEmail(""); }, 3000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invite someone"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        {/* header */}
        <div className="flex items-center justify-between bg-ink px-7 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Invite</p>
            <h2 className="text-xl font-extrabold text-white">Bring someone in</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-7 space-y-6">
          {/* share link */}
          <div>
            <p className="text-sm font-extrabold text-ink flex items-center gap-2">
              <Link2 className="size-4 text-ultra" /> Share your invite link
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-paper p-3 ring-1 ring-ink/10">
              <span className="flex-1 truncate text-xs text-ink/60 font-mono select-all">{link}</span>
              <button
                type="button"
                onClick={copyLink}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${copied ? "bg-mint/25 text-emerald-700" : "bg-ink text-white hover:bg-ultra"}`}
              >
                {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
          </div>

          {/* email */}
          <form onSubmit={sendInvite}>
            <p className="text-sm font-extrabold text-ink flex items-center gap-2">
              <Mail className="size-4 text-coral" /> Or send an email invite
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 rounded-2xl bg-paper px-4 py-3 text-sm text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra"
                required
              />
              <button
                type="submit"
                className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${sent ? "bg-mint/25 text-emerald-700" : "bg-ultra text-white hover:bg-ink"}`}
              >
                {sent ? "Sent!" : "Send"}
              </button>
            </div>
            {sent && <p className="mt-2 text-xs font-semibold text-emerald-700">Invite sent to {email} 🎉</p>}
          </form>

          <p className="text-xs text-ink/45 text-center">
            Invited people can join any flow you share with them.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const people: Person[] = q ? ALL_PEOPLE.filter((p) => p.name.toLowerCase().includes(q)) : ALL_PEOPLE;

  return (
    <>
      <PageHeader title="People" subtitle="Contributors and recipients across your flows.">
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ultra px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-ultra/25 transition hover:bg-ink"
        >
          <Plus className="size-4" /> Invite
        </button>
      </PageHeader>

      <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm text-ink/60 shadow-sm ring-1 ring-ink/10 focus-within:ring-2 focus-within:ring-ultra sm:max-w-sm">
        <Search className="size-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="w-full bg-transparent text-ink outline-none placeholder:text-ink/45"
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => (          <article key={p.name} className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <div className="flex items-center gap-4">
              <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${p.tone} text-sm font-extrabold text-white`}>
                {p.initials}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold text-ink">{p.name}</h3>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE[p.role]}`}>{p.role}</span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-xs font-semibold text-ink/55">Contributed</dt>
                <dd className="mt-0.5 font-extrabold text-ink">{money(p.contributed)}</dd>
              </div>
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-xs font-semibold text-ink/55">Received</dt>
                <dd className="mt-0.5 font-extrabold text-ink">{money(p.received)}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="text-xs font-semibold text-ink/55">In {p.flows.length} {p.flows.length === 1 ? "flow" : "flows"}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.flows.map((f) => (
                  <li key={f} className="rounded-lg bg-paper px-2.5 py-1 text-xs font-semibold text-ink/75 ring-1 ring-ink/5">{f}</li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-xs text-ink/45">Member since {p.since}</p>
          </article>
        ))}
      </div>

      {people.length === 0 && (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          {q ? (
            <p className="text-sm text-ink/55">No people match &ldquo;{query}&rdquo;.</p>
          ) : (
            <>
              <p className="text-xl font-extrabold text-ink">No people yet</p>
              <p className="mt-2 text-sm text-ink/55">
                People who contribute to or receive from your flows will appear here.
                Invite someone to get started.
              </p>
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-ultra px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ink"
              >
                <Plus className="size-4" /> Invite someone
              </button>
            </>
          )}
        </div>
      )}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </>
  );
}
