// src/app/layout.tsx
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import CommandMenu from "@/components/CommandMenu";

export const metadata: Metadata = {
  title: "FamilyHake",
  description: "Private Tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkAppearance = {
    variables: {
      colorPrimary: "#2563eb",
      colorBackground: "#f8fafc",
      colorText: "#0f172a",
    },
    layout: {
      logoPlacement: "inside",
      showOptionalFields: false,
    },
    elements: {
      card: "shadow-xl border border-slate-200 bg-white/90 backdrop-blur",
      formButtonPrimary: "bg-sky-600 hover:bg-sky-700",
      headerTitle: "text-slate-900",
      headerSubtitle: "text-slate-600",
      userButtonPopover: "z-[500] shadow-2xl",
      userButtonPopoverCard: "border border-slate-200",
      modalBackdrop: "z-[400] bg-slate-900/40 backdrop-blur-sm",
    },
  } as const;

  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="de" className="bg-gradient-to-br from-slate-50 via-white to-amber-50 text-slate-900">
        <body className="min-h-screen antialiased">
          <Header />
          <main className="max-w-6xl mx-auto w-full px-4 pb-12 pt-6">{children}</main>
          <CommandMenu />
        </body>
      </html>
    </ClerkProvider>
  );
}
