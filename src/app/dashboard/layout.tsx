import type { ReactNode } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { MobileTopbar, MobileNav } from "@/components/dashboard/MobileNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper font-sans text-ink antialiased">
      <Sidebar />
      <main className="min-w-0 flex-1 space-y-6 px-5 pb-24 pt-0 sm:px-8 lg:pt-8 lg:pb-8">
        <MobileTopbar />
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
