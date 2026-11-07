import type { ReactNode } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { MobileTopbar, MobileNav } from "@/components/dashboard/MobileNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper font-sans text-ink antialiased">
      <Sidebar />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col px-5 pb-6 pt-0 sm:px-8 lg:pt-8">
        <MobileTopbar />
        <div className="flex flex-1 flex-col space-y-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
