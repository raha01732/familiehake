// src/components/Header.tsx
"use client";

import React from "react";
import Link from "next/link";
import {
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignInButton,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, ChevronDown } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type HeaderProps = {
  clerkEnabled?: boolean;
  signInUrl?: string;
};

const NAV_LINKS = [
  { href: "/", label: "Start" },
  { href: "/tools", label: "Tools" },
  { href: "/admin", label: "Admin" },
];

export default function Header({ clerkEnabled = true, signInUrl }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Schließe mobiles Menü bei Route-Wechsel (Escape-Taste)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      className="sticky top-0 z-[520]"
      style={{
        borderBottom: "1px solid hsl(var(--header-border, var(--border)))",
        backgroundColor: "hsl(var(--header-bg, var(--card)) / 0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3 px-4 py-3 sm:px-6">
        {/* Logo / Brand */}
        <Brand />

        {/* Desktop Navigation */}
        <nav className="ml-3 hidden items-center gap-0.5 sm:flex">
          {NAV_LINKS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Auth-Bereich */}
        {clerkEnabled ? (
          <div className="flex items-center gap-2">
            <ClerkLoading>
              <div
                className="h-9 w-9 animate-pulse rounded-full"
                style={{
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                }}
                aria-label="Anmeldestatus wird geladen"
              />
            </ClerkLoading>
            <ClerkLoaded>
              <SignedOut>
                {signInUrl ? (
                  <Link href={signInUrl}>
                    <SignInBtn />
                  </Link>
                ) : (
                  <SignInButton mode="modal" forceRedirectUrl="/" signUpForceRedirectUrl="/">
                    <SignInBtn />
                  </SignInButton>
                )}
              </SignedOut>
              <SignedIn>
                <div className="relative z-[560]">
                  <NotificationBell />
                </div>
                <div className="relative z-[560]">
                  <UserMenu />
                </div>
              </SignedIn>
            </ClerkLoaded>
          </div>
        ) : (
          <NoAuthBadge />
        )}

        {/* Hamburger (nur Mobile) */}
        <button
          type="button"
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-xl transition sm:hidden"
          style={{
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
        >
          <span
            className={`block h-0.5 w-5 rounded-full transition-all duration-300 ${mobileOpen ? "translate-y-[7px] rotate-45" : ""}`}
            style={{ background: "hsl(var(--foreground))" }}
          />
          <span
            className={`block h-0.5 w-5 rounded-full transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`}
            style={{ background: "hsl(var(--foreground))" }}
          />
          <span
            className={`block h-0.5 w-5 rounded-full transition-all duration-300 ${mobileOpen ? "-translate-y-[7px] -rotate-45" : ""}`}
            style={{ background: "hsl(var(--foreground))" }}
          />
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div
          className="border-t sm:hidden"
          style={{
            borderColor: "hsl(var(--border))",
            background: "hsl(var(--header-bg, var(--card)))",
          }}
        >
          <nav className="flex flex-col gap-0.5 px-4 py-3">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium transition"
                style={{ color: "hsl(var(--foreground))" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "hsl(var(--secondary))";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/* ── Sub-Komponenten ────────────────────────── */

function Brand() {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
      style={{ color: "hsl(var(--foreground))" }}
    >
      <span className="brand-badge grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl text-sm font-bold shadow-md transition group-hover:scale-105">
        FH
      </span>
      <span className="hidden sm:block">FamilyHake</span>
    </Link>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative rounded-xl px-3 py-2 text-sm font-medium transition-colors"
      style={{ color: "hsl(var(--muted-foreground))" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "hsl(var(--foreground))";
        el.style.background = "hsl(var(--secondary))";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "hsl(var(--muted-foreground))";
        el.style.background = "transparent";
      }}
    >
      {children}
    </Link>
  );
}

function SignInBtn() {
  return (
    <button
      type="button"
      className="rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:brightness-105"
      style={{
        border: "1px solid hsl(var(--primary) / 0.4)",
        background: "hsl(var(--primary) / 0.08)",
        color: "hsl(var(--primary))",
      }}
    >
      Anmelden
    </button>
  );
}

function NoAuthBadge() {
  return (
    <span
      className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
      style={{
        border: "1px solid hsl(var(--border))",
        color: "hsl(var(--muted-foreground))",
      }}
    >
      Auth nicht konfiguriert
    </span>
  );
}

function UserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const avatarUrl = user?.imageUrl;
  const initials =
    (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") || "?";
  const userEmail =
    user?.primaryEmailAddress?.emailAddress ?? "Angemeldet";

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar-Button */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full transition hover:opacity-90 focus-visible:outline-none"
        style={{ color: "hsl(var(--foreground))" }}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            border: "2px solid hsl(var(--primary) / 0.35)",
            boxShadow: "0 0 0 3px hsl(var(--primary) / 0.1)",
            background: "hsl(var(--secondary))",
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Benutzeravatar" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="text-xs font-semibold">{initials}</span>
          )}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={`hidden transition-transform duration-200 sm:block ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "hsl(var(--muted-foreground))" }}
          aria-hidden
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-60 rounded-2xl"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 20px 48px -12px rgb(0 0 0 / 0.22)",
          }}
        >
          {/* Benutzerinfo */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                border: "2px solid hsl(var(--primary) / 0.3)",
                background: "hsl(var(--primary) / 0.1)",
                color: "hsl(var(--primary))",
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                {user?.fullName ?? "Angemeldeter Benutzer"}
              </p>
              <p className="truncate text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {userEmail}
              </p>
            </div>
          </div>

          <div style={{ height: 1, background: "hsl(var(--border))" }} />

          <div className="p-1.5">
            <MenuButton
              icon={<Settings size={14} aria-hidden />}
              onClick={async () => {
                setIsOpen(false);
                await openUserProfile();
              }}
            >
              Profil & Einstellungen
            </MenuButton>
            <MenuButton
              icon={<LogOut size={14} aria-hidden />}
              onClick={async () => {
                setIsOpen(false);
                await signOut({ redirectUrl: "/" });
              }}
              danger
            >
              Abmelden
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
      style={{
        color: danger ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? "hsl(var(--destructive) / 0.1)"
          : "hsl(var(--secondary))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {icon && (
        <span style={{ opacity: 0.75 }}>{icon}</span>
      )}
      {children}
    </button>
  );
}
