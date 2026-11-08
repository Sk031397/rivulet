"use client";

import { useState } from "react";
import { Send as SendIcon, Loader2, Check, AlertCircle } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import RecipientAutocomplete from "@/components/dashboard/RecipientAutocomplete";
import { useAddressBook } from "@/lib/addressBook";

type RecipientType = "EMAIL" | "PHONE";

interface SendResult {
  recipient: string;
  recipientType: RecipientType;
  amount: number;
  batchId?: string;
  itemStatus?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accept common phone formats: optional +, 7–15 digits, with spaces/dashes/dots/parens allowed.
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

const looksLikeEmail = (v: string) => v.includes("@");
const isValidEmail = (v: string) => EMAIL_RE.test(v);
// Strip common separators before validating a phone number.
const normalizePhone = (v: string) => v.replace(/[\s\-.()]/g, "");
const isValidPhone = (v: string) => PHONE_RE.test(normalizePhone(v));

export default function SendPage() {
  const { contacts, addContact } = useAddressBook();
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");

  const trimmed = recipient.trim();
  const recipientType: RecipientType = looksLikeEmail(trimmed) ? "EMAIL" : "PHONE";
  const recipientValid =
    trimmed.length > 0 &&
    (recipientType === "EMAIL" ? isValidEmail(trimmed) : isValidPhone(trimmed));
  const showRecipientError = recipientTouched && trimmed.length > 0 && !recipientValid;

  const blocked = sending || !recipientValid || !Number(amount) || Number(amount) <= 0;

  const submit = async () => {
    if (blocked) return;
    const amt = Number(amount);
    // Send a normalized phone (digits + leading +) so the API/PayPal gets a clean value.
    const cleanRecipient = recipientType === "PHONE" ? normalizePhone(trimmed) : trimmed;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: cleanRecipient, amount: amt, note: note.trim() }),
      });
      const data = (await res.json()) as { result?: SendResult; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setResult(data.result ?? null);
      // Remember this recipient in the local address book for next time.
      addContact(cleanRecipient);
      setRecipient("");
      setRecipientTouched(false);
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
        <div className="mt-3">
          <RecipientAutocomplete
            id="send-recipient"
            value={recipient}
            onChange={setRecipient}
            onBlur={() => setRecipientTouched(true)}
            contacts={contacts}
            placeholder="Name, phone number or email"
            inputMode={recipientType === "PHONE" ? "tel" : "email"}
            autoComplete={recipientType === "PHONE" ? "tel" : "email"}
            ariaInvalid={showRecipientError}
            invalid={showRecipientError}
          />
        </div>
        {showRecipientError ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-coral">
            <AlertCircle className="size-3.5 shrink-0" />
            {looksLikeEmail(trimmed)
              ? "That doesn't look like a valid email address."
              : "Enter a valid phone number (7–15 digits, e.g. +14155550123) or an email."}
          </p>
        ) : recipientValid ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
            <Check className="size-3.5 shrink-0" />
            {recipientType === "PHONE"
              ? "Valid phone number — phone payouts run in production. (Sandbox only supports email.)"
              : "Valid email address."}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-ink/45">
            {contacts.length > 0
              ? "Type a name to search your contacts, or enter a phone number or email."
              : "Enter a phone number or an email address."}
          </p>
        )}

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
