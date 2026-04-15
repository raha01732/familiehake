"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/tools/dienstplaner", label: "Monatsplan", exact: true },
  { href: "/tools/dienstplaner/mitarbeiter", label: "Mitarbeiter", exact: false },
  { href: "/tools/dienstplaner/einstellungen", label: "Einstellungen", exact: false },
];

export default function DienstplanerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <nav className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 flex items-center gap-2 h-14">
          <Link
            href="/tools"
            className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors flex items-center gap-1.5 mr-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Tools
          </Link>
          <div className="h-5 w-px bg-zinc-700 mr-2" />
          <div className="flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
            <span className="font-semibold text-sm text-zinc-100 mr-4">Dienstplaner</span>
          </div>
          <div className="flex items-center gap-0.5">
            {TABS.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href || pathname === tab.href + "/"
                : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-indigo-600 text-white font-medium"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
