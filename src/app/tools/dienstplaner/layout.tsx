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
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col">
      <nav className="border-b border-[hsl(var(--border))] bg-[hsl(var(--header-bg)/0.95)] backdrop-blur-sm sticky top-0 z-20">
        <div className="px-4 flex items-center gap-2 h-14">
          <Link
            href="/tools"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-sm transition-colors flex items-center gap-1.5 mr-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Tools
          </Link>
          <div className="h-5 w-px bg-[hsl(var(--border))] mr-2" />
          <div className="flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] mr-2" />
            <span className="font-semibold text-sm text-[hsl(var(--foreground))] mr-4">Dienstplaner</span>
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
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
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
