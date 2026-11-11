"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { DEMO_PROFILE, useIsDemo } from "@/lib/demoClient";
import { ArrowLeft, Settings, HelpCircle, LogOut, User, ChevronUp } from "lucide-react";
import Mark from "@/components/Mark";
import { BRAND } from "@/data/content";
import { SIDEBAR } from "@/data/dashboard";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function UserMenu({ name, email, onClose }: { name: string; email: string; onClose: () => void }) {
  const { signOut } = useClerk();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { icon: User,        label: "View profile", href: "/dashboard/settings" },
    { icon: Settings,    label: "Settings",     href: "/dashboard/settings" },
    { icon: HelpCircle,  label: "Help & support", href: "#" },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl bg-white shadow-2xl shadow-ink/30 ring-1 ring-ink/10"
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-ink/5 bg-paper px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-saffron to-coral text-xs font-extrabold text-ink">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-ink">{name}</p>
          <p className="truncate text-xs text-ink/55">{email}</p>
        </div>
      </div>

      {/* nav items */}
      <ul className="py-1">
        {items.map(({ icon: Icon, label, href }) => (
          <li key={label}>
            <Link
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-ultra/8 hover:text-ultra"
            >
              <Icon className="size-4 text-ink/50" />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      {/* sign out */}
      <div className="border-t border-ink/5 py-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            // Demo visitors have no Clerk session: ending the demo clears the cookie.
            if (document.cookie.includes("rivulet_demo=1")) { window.location.href = "/api/demo?exit=1"; return; }
            signOut({ redirectUrl: "/sign-in" });
          }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-semibold text-coral transition hover:bg-coral/8"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const isDemo = useIsDemo();
  const demo = isDemo && !user;

  const userName  = demo ? DEMO_PROFILE.fullName : user?.fullName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Account";
  const userEmail = demo ? DEMO_PROFILE.email : user?.emailAddresses[0]?.emailAddress ?? "";
  const userInit  = initials(userName);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink p-5 text-white lg:flex">
      <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} site`}>
        <Mark />
        <span className="text-xl font-extrabold tracking-tight">{BRAND.name}</span>
      </Link>

      <nav className="mt-10 flex flex-1 flex-col gap-1" aria-label="Dashboard">
        {SIDEBAR.map(({ icon: Icon, label, path, badge }) => {
          const active = pathname === path;
          return (
            <Link
              key={label}
              href={path}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`size-5 ${active ? "text-saffron" : ""}`} />
              {label}
              {badge && (
                <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Link href="/" className="mb-4 flex items-center gap-2 px-3 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeft className="size-4" /> Back to site
      </Link>

      {/* user area */}
      <div className="relative">
        {menuOpen && (
          <UserMenu
            name={userName}
            email={userEmail}
            onClose={() => setMenuOpen(false)}
          />
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 transition hover:bg-white/10"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-saffron to-coral text-sm font-extrabold text-ink">
            {userInit}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-bold">{userName}</p>
            <p className="truncate text-xs text-white/60">{userEmail}</p>
          </div>
          <ChevronUp
            className={`size-4 shrink-0 text-white/40 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </aside>
  );
}
