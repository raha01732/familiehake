// /workspace/familiehake/src/app/layout.tsx
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import CommandMenu from "@/components/CommandMenu";
import Header from "@/components/Header";
import AdminErrorBanner from "@/components/AdminErrorBanner";
import PostHogProvider from "@/components/PostHogProvider";
import * as Sentry from '@sentry/nextjs';
import { getSessionInfo } from "@/lib/auth";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { getActiveTheme, getThemeCssVars, getThemePresetById, getThemeValue, THEME_PRESET_COOKIE } from "@/lib/theme";

export function generateMetadata(): Metadata {
  return {
    title: "FamilyHake",
    description: "Private Tools",
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export const dynamic = "force-dynamic";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkSignInUrl = "https://accounts.familiehake.de/sign-in";
const isClerkEnabled = Boolean(clerkPublishableKey);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isClerkEnabled ? await getSessionInfo() : null;
  const user = isClerkEnabled ? await currentUser() : null;
  const cookieStore = await cookies();
  const presetFromCookie = cookieStore.get(THEME_PRESET_COOKIE)?.value ?? null;
  const activeTheme =
    getThemePresetById(presetFromCookie) ?? (await getActiveTheme(user?.id ?? null));
  const themeVars = getThemeCssVars(activeTheme);
  const clerkAppearance = {
    variables: {
      colorPrimary: `hsl(${getThemeValue(activeTheme, "--primary", "199 89% 48%")})`,
      colorBackground: `hsl(${getThemeValue(activeTheme, "--background", "222 47% 10%")})`,
      colorText: `hsl(${getThemeValue(activeTheme, "--foreground", "210 40% 96%")})`,
      colorTextSecondary: `hsl(${getThemeValue(activeTheme, "--muted-foreground", "214 20% 70%")})`,
      colorInputBackground: `hsl(${getThemeValue(activeTheme, "--card", "222 47% 12%")})`,
      colorInputText: `hsl(${getThemeValue(activeTheme, "--card-foreground", "210 40% 96%")})`,
      colorNeutral: `hsl(${getThemeValue(activeTheme, "--border", "215 25% 25%")})`,
    },
    layout: {
      logoPlacement: "inside",
      showOptionalFields: false,
      socialButtonsPlacement: "bottom",
    },
    elements: {
      card: "shadow-2xl border border-white/10 bg-[hsl(var(--card)/0.9)] backdrop-blur-xl text-[hsl(var(--card-foreground))]",
      formButtonPrimary:
        "brand-button rounded-xl text-sm font-semibold hover:opacity-95 shadow-lg shadow-black/15",
      headerTitle: "text-[hsl(var(--foreground))]",
      headerSubtitle: "text-[hsl(var(--muted-foreground))]",
      footerActionText: "text-[hsl(var(--foreground))]",
      footerActionLink: "text-[hsl(var(--primary))] hover:text-[hsl(var(--accent))]",
      userButtonPopover: "z-[520] shadow-2xl",
      userButtonPopoverCard:
        "border border-white/10 bg-[hsl(var(--card)/0.95)] text-[hsl(var(--card-foreground))]",
      modalBackdrop: "z-[510] bg-[hsl(var(--background)/0.7)] backdrop-blur-md",
      modalContent:
        "bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] border border-white/10 shadow-2xl",
      formFieldInput:
        "bg-[hsl(var(--card)/0.7)] border-white/10 text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--muted-foreground))]",
      socialButtonsBlockButtonText: "text-[hsl(var(--primary-foreground))]",
      profileSectionTitleText: "text-[hsl(var(--card-foreground))]",
      navbar: "bg-[hsl(var(--background)/0.6)] text-[hsl(var(--foreground))]",
    },
  } as const;
  const isAdmin = Boolean(
    session && session.signedIn && (session.isSuperAdmin || session.roles.some((role) => role.name === "admin"))
  );
  const shell = (
    <div className="relative flex min-h-screen flex-col">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[url('https://www.toptal.com/designers/subtlepatterns/uploads/dot-grid.png')] opacity-20"
        aria-hidden
      />
      <AdminErrorBanner isAdmin={isAdmin} />
      <Header clerkEnabled={isClerkEnabled} signInUrl={clerkSignInUrl} />
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-4 pb-16 pt-8">
        {children}
      </main>
      {isClerkEnabled ? <CommandMenu /> : null}
    </div>
  );
  const analyticsShell = <PostHogProvider>{shell}</PostHogProvider>;

  return (
    <html
      lang="de"
      className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
      style={themeVars as React.CSSProperties}
    >
      <body className="min-h-screen antialiased bg-[radial-gradient(circle_at_20%_20%,rgba(var(--accent-glow-1),0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(var(--accent-glow-2),0.12),transparent_40%),radial-gradient(circle_at_50%_60%,rgba(var(--accent-glow-3),0.18),transparent_45%)]">
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
