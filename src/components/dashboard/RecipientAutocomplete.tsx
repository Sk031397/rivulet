"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, Mail, Phone, BookUser } from "lucide-react";
import { type Contact } from "@/lib/addressBook";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  contacts: Contact[];
  placeholder?: string;
  inputMode?: "email" | "tel";
  autoComplete?: string;
  ariaInvalid?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * A combobox that lets the user type a recipient or pick one from their
 * address book. Filters by name and address, supports arrow-key navigation,
 * Enter to choose, and Escape to dismiss the list.
 */
export default function RecipientAutocomplete({
  value,
  onChange,
  onBlur,
  contacts,
  placeholder = "Phone number or email",
  inputMode,
  autoComplete,
  ariaInvalid,
  invalid,
  id,
}: Props) {
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Filter the address book against the current input.
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? contacts.filter(
          (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q),
        )
      : contacts;
    return list.slice(0, 6);
  }, [contacts, value]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (c: Contact) => {
    onChange(c.address);
    setOpen(false);
    setActive(-1);
  };

  const showList = open && matches.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === "ArrowDown" && matches.length > 0) {
        setOpen(true);
        setActive(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setActive((a) => (a + 1) % matches.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => (a - 1 + matches.length) % matches.length);
      e.preventDefault();
    } else if (e.key === "Enter" && active >= 0) {
      choose(matches[active]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink/35" />
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listboxId}-opt-${active}` : undefined}
          aria-invalid={ariaInvalid}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          className={`w-full rounded-2xl bg-paper py-4 pl-11 pr-11 text-ink outline-none ring-1 placeholder:text-ink/45 focus:ring-2 ${
            invalid ? "ring-coral/60 focus:ring-coral" : "ring-ink/10 focus:ring-ultra"
          }`}
        />
        {contacts.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Browse contacts"
            tabIndex={-1}
            className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink/40 transition hover:bg-ink/5 hover:text-ultra"
          >
            <BookUser className="size-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl shadow-ink/20 ring-1 ring-ink/10"
        >
          {matches.map((c, i) => {
            const isPhone = !c.address.includes("@");
            const Icon = isPhone ? Phone : Mail;
            return (
              <li
                key={c.address}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  // mousedown (not click) so it fires before input blur
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                  i === active ? "bg-paper" : ""
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ultra/10 text-xs font-extrabold text-ultra">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-ink/55">
                    <Icon className="size-3 shrink-0" /> {c.address}
                  </span>
                </span>
                {c.source === "saved" && (
                  <span className="shrink-0 rounded-full bg-mint/25 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Saved
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
