"use client";

import { useState } from "react";
import { Send as SendIcon, Loader2, Check, AlertCircle } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";

type RecipientType = "EMAIL" | "PHONE";

interface SendResult {
  recipient: string;
  recipientType: RecipientType;
  amount: number;
  batchId?: string;
  itemStatus?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");

  const recipientType: RecipientType = recipient.includes("@") ? "EMAIL" : "PHONE";
  const blocked = sending || !recipient.trim() || !Number(amount) || Number(amount) <= 0;

  const submit = async () => {
    if (blocked) return;
    const amt = Number(amount);
    setSending(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: recipient.trim(), amount: amt, note: note.trim() }),
      });
      const data = (await res.json()) as { result?: SendResult; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setResult(data.result ?? null);
      setRecipient("");
      setAmount("");
      setNote("");
    } catch (e) {
      setError((e as Error).message ?? "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title="Send" subtitle="Send money to a friend by phone or email — instantly via PayPal." />

      <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5 shadow-xl shadow-ink/10">
        <label htmlFor="send-recipient" className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <SendIcon className="size-4 text-coral" /> Send to
        </label>
        <input
          id="send-recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Phone number or email"
          className="mt-3 w-full rounded-2xl bg-paper px-5 py-4 text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra"
        />
        <p className="mt-1.5 text-xs text-ink/45">
          {recipientType === "PHONE"
            ? "Detected a phone number — phone payouts run in production. (Sandbox only supports email.)"
            : "Detected an email address."}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="send-amount" className="text-sm font-extrabold text-ink">Amount</label>
            <div className="mt-1 flex items-center rounded-2xl bg-paper px-5 ring-1 ring-ink/10 focus-within:ring-2 focus-within:ring-ultra">
              <span className="text-ink/50">$</span>
              <input
                id="send-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
                className="w-full bg-transparent px-2 py-4 text-ink outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="send-note" className="text-sm font-extrabold text-ink">Note (optional)</label>
            <input
              id="send-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner, thanks!"
              className="mt-1 w-full rounded-2xl bg-paper px-5 py-4 text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={blocked}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-4 font-bold text-white transition hover:bg-ultra disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? (
            <><Loader2 className="size-4 animate-spin" /> Sending…</>
          ) : (
            <><SendIcon className="size-4" /> Send money</>
          )}
        </button>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-coral/10 p-4 text-sm font-semibold text-coral">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-5 rounded-2xl bg-mint/25 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check className="size-5" /> <span className="font-extrabold">Money sent</span>
            </div>
            <p className="mt-2 text-sm text-ink/75">
              {money(result.amount)} to <span className="font-bold">{result.recipient}</span> ({result.recipientType})
            </p>
            <p className="mt-1 text-xs text-ink/55">
              PayPal payout batch <span className="font-mono">{result.batchId ?? "—"}</span> · item status{" "}
              <span className="font-bold">{result.itemStatus ?? "—"}</span>
            </p>
            <p className="mt-2 text-xs text-ink/45">
              {result.itemStatus === "UNCLAIMED"
                ? "Recipient hasn't claimed this yet — PayPal will notify them."
                : "Payouts show up in your dashboard activity once PayPal settles them."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
