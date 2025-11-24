// src/components/Header.tsx
"use client";

import Link from "next/link";
import {
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="sticky top-0 z-[120] border-b border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold text-slate-900 tracking-tight">
          FamilyHake
        </Link>

        <nav className="ml-4 flex items-center gap-3 text-sm text-slate-600">
          <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
          <Link href="/tools" className="hover:text-slate-900">Tools</Link>
          <Link href="/admin" className="hover:text-slate-900">Admin</Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ClerkLoading>
            <div
              className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 animate-pulse"
              aria-label="Anmeldestatus wird geladen"
            />
          </ClerkLoading>

          <ClerkLoaded>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:-translate-y-[1px] hover:border-sky-200 hover:bg-sky-50">
                  Anmelden
                </button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              {/* Hoher z-index, damit das Overlay nicht von Layouts überdeckt wird */}
              <div className="relative z-[320]">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "ring-2 ring-sky-100 shadow-sm",
                      userButtonPopover: "z-[500] drop-shadow-2xl",
                      userButtonPopoverCard: "bg-white border border-slate-200",
                    },
                  }}
                />
              </div>
            </SignedIn>
          </ClerkLoaded>
        </div>
      </div>
    </header>
  );
}
