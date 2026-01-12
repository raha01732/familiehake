// src/components/Header.tsx
"use client";

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

type HeaderProps = {
  clerkEnabled?: boolean;
  signInUrl?: string;
};

export default function Header({ clerkEnabled = true, signInUrl }: HeaderProps) {
  if (!clerkEnabled) {
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

          <div className="ml-auto">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200">
              Auth nicht konfiguriert
            </span>
          </div>
        </div>
      </header>
    );
  }

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
              {signInUrl ? (
                <Link href={signInUrl}>
                  <button className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-cyan-500/10 transition hover:-translate-y-[1px] hover:border-cyan-300/60 hover:bg-cyan-500/20">
                    Anmelden
                  </button>
                </Link>
              ) : (
                <SignInButton
                  mode="modal"
                  forceRedirectUrl="/dashboard"
                  signUpForceRedirectUrl="/dashboard"
                >
                  <button className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-cyan-500/10 transition hover:-translate-y-[1px] hover:border-cyan-300/60 hover:bg-cyan-500/20">
                    Anmelden
                  </button>
                </SignInButton>
              )}
            </SignedOut>

            <SignedIn>
              <div className="relative z-[560]">
                <UserMenu />
              </div>
            </SignedIn>
          </ClerkLoaded>
        </div>
      </div>
    </header>
  );
}

function UserMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const avatarUrl = user?.imageUrl;
  const initials = (user?.firstName?.[0] ?? "?") + (user?.lastName?.[0] ?? "");
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "Angemeldet";

  const handleProfile = async () => {
    setIsOpen(false);
    await openUserProfile();
  };

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut({ redirectUrl: "/" });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/25 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Benutzeravatar"
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold text-white">{initials}</span>
        )}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
          <div className="px-4 py-3 text-sm text-slate-200">
            <p className="font-semibold text-white">{user?.fullName ?? "Angemeldeter Benutzer"}</p>
            <p className="truncate text-xs text-slate-400">{userEmail}</p>
          </div>
          <div className="border-t border-white/10" />
          <button
            type="button"
            onClick={handleProfile}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Profil & Einstellungen
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-200 transition hover:bg-white/10"
          >
            Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
}
