"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Mark from "./Mark";
import { BRAND } from "@/data/content";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Use cases", href: "#use-cases" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Templates", href: "/dashboard/templates" },
];

export default function Header() {
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
      <div className="flex items-center gap-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <Mark />
          <span className="text-xl font-extrabold tracking-tight text-ink">{BRAND.name}</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {NAV_LINKS.map((n) => (
            <a
              key={n.label}
              href={n.href}
              className="flex items-center gap-1 text-sm font-semibold text-ink/80 transition hover:text-ultra"
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-5">
        <Link href="/dashboard" className="text-sm font-semibold text-ultra transition hover:text-ink">
          Log in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ultra"
        >
          Get started free
        </Link>
      </div>
    </header>
  );
}
