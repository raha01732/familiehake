// /workspace/familiehake/src/app/layout.tsx
import React from "react";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import DynamicUserChrome from "@/components/layout/DynamicUserChrome";
import * as Sentry from "@sentry/nextjs";
import { getSessionInfo } from "@/lib/auth";
import { env, getClerkPublishableKey } from "@/lib/env";
import { PreviewTopBanner } from "@/components/PreviewNotice";

export function generateMetadata(): Metadata {
  return {
    title: "FamilyHake",
    description: "Private Tools",
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

const configuration = env();
const clerkPublishableKey = getClerkPublishableKey(configuration);
const clerkSignInUrl = configuration.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";
const isClerkEnabled = Boolean(clerkPublishableKey);
const clerkAppearance = {
  variables: {
    colorPrimary: "hsl(217 91% 60%)",
    colorBackground: "hsl(210 40% 98%)",
    colorText: "hsl(222 35% 14%)",
    colorTextSecondary: "hsl(222 16% 42%)",
    colorInputBackground: "hsl(0 0% 100%)",
    colorInputText: "hsl(222 35% 14%)",
    colorNeutral: "hsl(215 30% 86%)",
  },
  layout: {
    logoPlacement: "inside",
    showOptionalFields: false,
    socialButtonsPlacement: "bottom",
  },
  elements: {
    card: "shadow-2xl border border-slate-200 bg-[hsl(var(--card)/0.96)] backdrop-blur-xl text-[hsl(var(--card-foreground))]",
    formButtonPrimary: "brand-button rounded-xl text-sm font-semibold hover:opacity-95 shadow-lg shadow-blue-400/20",
    headerTitle: "text-[hsl(var(--foreground))]",
    headerSubtitle: "text-[hsl(var(--muted-foreground))]",
    footerActionText: "text-[hsl(var(--foreground))]",
    footerActionLink: "text-[hsl(var(--primary))] hover:text-[hsl(var(--accent))]",
    userButtonPopover: "z-[520] shadow-2xl",
    userButtonPopoverCard: "border border-slate-200 bg-[hsl(var(--card)/0.98)] text-[hsl(var(--card-foreground))]",
    modalBackdrop: "z-[510] bg-[hsl(var(--background)/0.7)] backdrop-blur-md",
    modalContent: "bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] border border-slate-200 shadow-2xl",
    formFieldInput:
      "bg-[hsl(var(--card)/0.95)] border-slate-200 text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--muted-foreground))]",
    socialButtonsBlockButtonText: "text-[hsl(var(--primary-foreground))]",
    profileSectionTitleText: "text-[hsl(var(--card-foreground))]",
    navbar: "bg-[hsl(var(--background)/0.7)] text-[hsl(var(--foreground))]",
  },
} as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionInfo();
  const shell = (
    <div className="relative flex min-h-screen flex-col">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(var(--accent-glow-1),0.14),transparent_45%),radial-gradient(circle_at_80%_2%,rgba(var(--accent-glow-2),0.12),transparent_45%),radial-gradient(circle_at_40%_80%,rgba(var(--accent-glow-3),0.1),transparent_45%)]"
        aria-hidden
      />
      <DynamicUserChrome clerkEnabled={isClerkEnabled} signInUrl={clerkSignInUrl} />
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-4 pb-16 pt-8 sm:px-6">
        <PreviewTopBanner />
        {children}
      </main>
      <footer
        style={{
          borderTop: "1px solid hsl(var(--border))",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          fontSize: "0.75rem",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <span>© {new Date().getFullYear()} FamilieHake</span>
        <Link
          href="/legal/terms"
          style={{ color: "hsl(var(--muted-foreground))", textDecoration: "none" }}
        >
          Nutzungsbedingungen
        </Link>
        <Link
          href="/legal/privacy"
          style={{ color: "hsl(var(--muted-foreground))", textDecoration: "none" }}
        >
          Datenschutz
        </Link>
      </footer>
    </div>
  );
  const analyticsShell = <PostHogProvider enableIdentity={session.signedIn}>{shell}</PostHogProvider>;

  return (
    <html
      lang="de"
      className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
    >
      <body className="min-h-screen antialiased">
        {isClerkEnabled ? (
          <ClerkProvider appearance={clerkAppearance} publishableKey={clerkPublishableKey} signInUrl={clerkSignInUrl}>
            {analyticsShell}
          </ClerkProvider>
        ) : (
          analyticsShell
        )}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
