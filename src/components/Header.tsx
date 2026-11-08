"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Mark from "./Mark";
import { BRAND } from "@/data/content";

const NAV_LINKS = [
  { label: "Features",     href: "#features" },
  { label: "Use cases",    href: "#use-cases" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Templates",    href: "/dashboard/templates" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
            <Mark />
            <span className="text-xl font-extrabold tracking-tight text-ink">{BRAND.name}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            {NAV_LINKS.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="text-sm font-semibold text-ink/80 transition hover:text-ultra"
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-5 md:flex">
          <Link href="/sign-in" className="text-sm font-semibold text-ultra transition hover:text-ink">
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ultra"
          >
            Get started free
          </Link>
        </div>

        {/* Mobile: CTA + hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <Link
            href="/sign-up"
            className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-ultra"
          >
            Get started
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-full text-ink transition hover:bg-ink/8"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden animate-fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <nav
            id="mobile-nav"
            aria-label="Mobile navigation"
            className="fixed inset-x-0 top-0 z-40 rounded-b-3xl bg-white px-6 pb-8 pt-5 shadow-2xl shadow-ink/20 md:hidden animate-fade-up"
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2.5"
                onClick={() => setOpen(false)}
                aria-label={`${BRAND.name} home`}
              >
                <Mark />
                <span className="text-xl font-extrabold tracking-tight text-ink">{BRAND.name}</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full text-ink transition hover:bg-ink/8"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Links */}
            <ul className="mt-8 space-y-1">
              {NAV_LINKS.map((n, i) => (
                <li
                  key={n.label}
                  className="animate-fade-up"
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                >
                  <a
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center rounded-2xl px-4 py-3 text-base font-semibold text-ink transition hover:bg-paper hover:text-ultra"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Bottom CTAs */}
            <div
              className="mt-8 flex flex-col gap-3 animate-fade-up"
              style={{ animationDelay: "260ms" }}
            >
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className="rounded-full bg-ink py-3 text-center text-sm font-bold text-white transition hover:bg-ultra"
              >
                Get started free
              </Link>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="rounded-full py-3 text-center text-sm font-semibold text-ultra transition hover:text-ink"
              >
                Log in
              </Link>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
