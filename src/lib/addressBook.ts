"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A single address-book entry. The address is either an email or a phone
 * number — the same values the Send flow accepts as a recipient.
 */
export interface Contact {
  /** Display name (falls back to the address local-part when unknown). */
  name: string;
  /** Email address or phone number used as the payout target. */
  address: string;
  /** Where this contact came from — used only for a small UI hint. */
  source: "flow" | "saved";
}

const STORAGE_KEY = "rivulet-contacts";

/* ── localStorage-backed "saved" contacts ───────────────────────────── */
function readSaved(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Contact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(contacts: Contact[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Derive a friendly display name from an email/phone when none is known. */
function nameFromAddress(address: string): string {
  if (address.includes("@")) {
    const local = address.split("@")[0];
    return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return address; // phone numbers show as-is
}

/** Merge contacts, de-duplicating on a normalized address (last write wins on name). */
function mergeContacts(...lists: Contact[][]): Contact[] {
  const byAddr = new Map<string, Contact>();
  for (const list of lists) {
    for (const c of list) {
      const key = c.address.trim().toLowerCase();
      if (!key) continue;
      const existing = byAddr.get(key);
      // Prefer a real name over an auto-derived one; prefer "saved" source label.
      byAddr.set(key, {
        address: c.address.trim(),
        name: c.name?.trim() || existing?.name || nameFromAddress(c.address),
        source: existing?.source === "saved" || c.source === "saved" ? "saved" : c.source,
      });
    }
  }
  return Array.from(byAddr.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Pull recipients (with emails) out of the flow store. */
async function fetchFlowContacts(signal?: AbortSignal): Promise<Contact[]> {
  try {
    const res = await fetch("/api/flows", { signal });
    const data = (await res.json()) as {
      flows?: Array<{ payouts?: Array<{ recipient?: string | null }> }>;
    };
    const out: Contact[] = [];
    for (const flow of data.flows ?? []) {
      for (const p of flow.payouts ?? []) {
        const addr = (p.recipient ?? "").trim();
        if (!addr) continue;
        out.push({ address: addr, name: nameFromAddress(addr), source: "flow" });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * React hook: an address book combining flow recipients and locally-saved
 * contacts. Returns the merged list plus an `addContact` helper that persists
 * a new contact to localStorage.
 */
export function useAddressBook() {
  const [flowContacts, setFlowContacts] = useState<Contact[]>([]);
  const [saved, setSaved] = useState<Contact[]>([]);

  useEffect(() => {
    setSaved(readSaved());
    const ctrl = new AbortController();
    fetchFlowContacts(ctrl.signal).then(setFlowContacts);
    return () => ctrl.abort();
  }, []);

  const addContact = useCallback((address: string, name?: string) => {
    const addr = address.trim();
    if (!addr) return;
    setSaved((prev) => {
      const next = mergeContacts(prev, [
        { address: addr, name: name?.trim() || nameFromAddress(addr), source: "saved" },
      ]);
      writeSaved(next);
      return next;
    });
  }, []);

  const contacts = mergeContacts(saved, flowContacts);

  return { contacts, addContact };
}
