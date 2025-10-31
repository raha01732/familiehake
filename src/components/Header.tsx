"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ? "text-white font-semibold" : "text-zinc-400 hover:text-white";

  // Admin gilt als aktiv auch für Unterseiten (z. B. /admin/users, /monitoring)
  const adminActive =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/monitoring";
  const toolsActive = pathname === "/tools" || pathname.startsWith("/tools/");

  return (
    <header className="w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link href="/" className="text-zinc-100 font-semibold text-lg">
          Private Tools
        </Link>

        {/* Hauptnavigation */}
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className={isActive("/dashboard")}>
            Dashboard
          </Link>
          <Link
            href="/tools"
            className={toolsActive ? "text-white font-semibold" : "text-zinc-400 hover:text-white"}
          >
            Tools
          </Link>
          <Link
            href="/admin"
            className={adminActive ? "text-white font-semibold" : "text-zinc-400 hover:text-white"}
          >
            Admin
          </Link>
        </nav>

        {/* Benutzer-Menü (rechts) */}
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-xl border border-zinc-700 text-zinc-200 text-xs px-3 py-2 hover:bg-zinc-800/60">
                Anmelden
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            {/* UserButton rendert Avatar + Dropdown (Profil, Sign out, etc.) */}
            <UserButton
              appearance={{
                elements: {
                  userButtonPopoverCard: "bg-zinc-900 border border-zinc-800",
                },
              }}
              // optional: nach Login/Logout navigieren
              afterSignOutUrl="/"
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
