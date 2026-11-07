"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Mark from "@/components/Mark";
import { BRAND } from "@/data/content";
import { SIDEBAR, USER } from "@/data/dashboard";

/** Slim brand bar shown at the top of dashboard pages on mobile/tablet (< lg). */
export function MobileTopbar() {
  return (
    <div className="-mx-5 sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white sm:-mx-8 lg:hidden">
      <Link href="/" className="flex items-center gap-2" aria-label={`${BRAND.name} site`}>
        <Mark />
        <span className="text-lg font-extrabold tracking-tight">{BRAND.name}</span>
      </Link>
      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-saffron to-coral text-xs font-extrabold text-ink">
        {USER.initials}
      </span>
    </div>
  );
}

/** Fixed bottom tab bar — the mobile equivalent of the desktop Sidebar. */
export function MobileNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-ink/10 bg-white/95 backdrop-blur lg:hidden"
    >
      {SIDEBAR.map(({ icon: Icon, label, path }) => {
        const active = pathname === path;
        return (
          <Link
            key={label}
            href={path}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 ${active ? "text-ink" : "text-ink/50"}`}
          >
            <Icon className={`size-5 ${active ? "text-saffron" : "text-ink/40"}`} />
            <span className="whitespace-nowrap text-[10px] font-bold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
