// src/components/Header.tsx
"use client";

import Link from "next/link";
import { ClerkLoaded, ClerkLoading, SignedIn, SignedOut, SignInButton, useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

type HeaderProps = {
  clerkEnabled?: boolean;
  signInUrl?: string;
};

const HEADER_LINKS = [
  { href: "/", label: "Start" },
  { href: "/tools", label: "Tools" },
  { href: "/admin", label: "Admin" },
];

export default function Header({ clerkEnabled = true, signInUrl }: HeaderProps) {
  if (!clerkEnabled) {
    return (
      <header className="sticky top-0 z-[520] border-b border-slate-200 bg-[hsl(var(--background)/0.8)] backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-[1800px] items-center gap-4 px-4 py-4">
          <Brand />
          <TopNav />
          <div className="ml-auto">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Auth nicht konfiguriert
            </span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-[520] border-b border-slate-200 bg-[hsl(var(--background)/0.8)] backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-4 px-4 py-4">
        <Brand />
        <TopNav />

        <div className="ml-auto flex items-center gap-3">
          <ClerkLoading>
            <div className="h-9 w-9 animate-pulse rounded-full border border-slate-300 bg-slate-100" aria-label="Anmeldestatus wird geladen" />
          </ClerkLoading>

          <ClerkLoaded>
            <SignedOut>
              {signInUrl ? (
                <Link href={signInUrl}>
                  <button className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                    Anmelden
                  </button>
                </Link>
              ) : (
                <SignInButton mode="modal" forceRedirectUrl="/" signUpForceRedirectUrl="/">
                  <button className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
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

function Brand() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
      <span className="brand-badge grid h-9 w-9 place-items-center rounded-2xl shadow-md transition group-hover:scale-105">FH</span>
      <span className="hidden sm:block">FamilyHake</span>
    </Link>
  );
}

function TopNav() {
  return (
    <nav className="ml-2 flex items-center gap-1 text-xs sm:text-sm">
      {HEADER_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-full px-3 py-2 font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
        >
          {item.label}
        </Link>
      ))}
    </nav>
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
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm ring-2 ring-blue-200 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="Benutzeravatar" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="text-sm font-semibold">{initials}</span>
        )}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl">
          <div className="px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{user?.fullName ?? "Angemeldeter Benutzer"}</p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          </div>
          <div className="border-t border-slate-200" />
          <button
            type="button"
            onClick={handleProfile}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Profil & Einstellungen
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
}
