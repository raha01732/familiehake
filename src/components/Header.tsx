// src/components/Header.tsx
"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="sticky top-0 z-[100] border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold text-zinc-100 tracking-tight">
          FamilyHake
        </Link>

        <nav className="ml-4 flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tools" className="hover:underline">Tools</Link>
          <Link href="/admin" className="hover:underline">Admin</Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
                Anmelden
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            {/* Hoher z-index, damit das Overlay nicht von Layouts überdeckt wird */}
            <div className="relative z-[200]">
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    userButtonAvatarBox: "ring-1 ring-zinc-700",
                  },
                }}
              />
            </div>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
