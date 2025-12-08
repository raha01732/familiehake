// src/app/layout.tsx
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import CommandMenu from "@/components/CommandMenu";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "FamilyHake",
  description: "Private Tools",
};

const clerkAppearance = {
  variables: {
    colorPrimary: "#0ea5e9",
    colorBackground: "#0b1120",
    colorText: "#0f172a",
    colorInputBackground: "#0b1120",
    colorInputText: "#e2e8f0",
  },
  layout: {
    logoPlacement: "inside",
    showOptionalFields: false,
    socialButtonsPlacement: "bottom",
  },
  elements: {
    card: "shadow-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl",
    formButtonPrimary:
      "bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950",
    headerTitle: "text-slate-50",
    headerSubtitle: "text-slate-300",
    footerActionText: "text-slate-200",
    footerActionLink: "text-cyan-200 hover:text-cyan-100",
    userButtonPopover: "z-[520] shadow-2xl",
    userButtonPopoverCard: "border border-white/10 bg-slate-900/90",
    modalBackdrop: "z-[510] bg-slate-950/70 backdrop-blur-md",
    formFieldInput: "bg-slate-950/30 border-white/10 text-slate-100 placeholder:text-slate-400",
    socialButtonsBlockButtonText: "text-slate-900",
  },
} as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasClerkConfig = Boolean(clerkPublishableKey);

  const layoutShell = (
    <html lang="de" className="bg-slate-950 text-slate-100">
      <body className="min-h-screen antialiased bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_40%),radial-gradient(circle_at_50%_60%,rgba(56,189,248,0.18),transparent_45%)]">
        <div className="absolute inset-0 -z-10 bg-[url('https://www.toptal.com/designers/subtlepatterns/uploads/dot-grid.png')] opacity-20" aria-hidden />

        {!hasClerkConfig && (
          <div className="max-w-4xl mx-auto w-full px-4 py-6">
            <div className="rounded-2xl border border-amber-300/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-100 shadow-lg shadow-amber-500/15">
              <p className="font-semibold">Clerk ist nicht konfiguriert</p>
              <p className="mt-1 text-amber-200/90">
                Bitte die Umgebungsvariable <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in Vercel setzen, damit das Benutzer-Menü geladen werden kann.
              </p>
            </div>
          </div>
        )}

        {hasClerkConfig ? <Header /> : null}
        <main className="max-w-6xl mx-auto w-full px-4 pb-16 pt-8">{children}</main>
        <CommandMenu />
      </body>
    </html>
  );

  if (!hasClerkConfig) {
    return layoutShell;
  }

  return (
    <ClerkProvider appearance={clerkAppearance} publishableKey={clerkPublishableKey} signInUrl="/sign-in">
      {layoutShell}
    </ClerkProvider>
  );
}
