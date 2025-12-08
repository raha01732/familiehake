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
    <header className="sticky top-0 z-[520] border-b border-white/10 bg-slate-950/60 backdrop-blur-2xl">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
        <Link href="/" className="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
          <span className="h-9 w-9 rounded-2xl bg-gradient-to-br from-cyan-400/80 to-sky-600/90 grid place-items-center shadow-lg shadow-cyan-500/20 transition group-hover:scale-105">
            FH
          </span>
          <span className="hidden sm:block">FamilyHake</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 text-xs sm:text-sm text-slate-200">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/tools", label: "Tools" },
            { href: "/admin", label: "Admin" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 font-medium text-slate-200 transition hover:text-white hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ClerkLoading>
            <div
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 animate-pulse"
              aria-label="Anmeldestatus wird geladen"
            />
          </ClerkLoading>

          <ClerkLoaded>
            <SignedOut>
              <SignInButton
                mode="modal"
                forceRedirectUrl="/dashboard"
                signUpForceRedirectUrl="/dashboard"
              >
                <button className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-cyan-500/10 transition hover:-translate-y-[1px] hover:border-cyan-300/60 hover:bg-cyan-500/20">
                  Anmelden
                </button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <div className="relative z-[560]">
                <UserButton
                  afterSignOutUrl="/"
                  userProfileMode="modal"
                  userProfileUrl="/settings"
                  signInUrl="/sign-in"
                  appearance={{
                    elements: {
                      rootBox: "pointer-events-auto cursor-pointer",
                      avatarBox:
                        "h-10 w-10 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/25 transition hover:scale-[1.02] pointer-events-auto",
                      userButtonPopover: "z-[600] drop-shadow-2xl",
                      userButtonPopoverCard: "bg-slate-900/95 border border-white/10",
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
