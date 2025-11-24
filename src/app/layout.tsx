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
  return (
    <ClerkProvider>
      <html lang="de" className="bg-zinc-950 text-zinc-50">
        <body className="min-h-screen antialiased">
          <Header />
          <main className="max-w-6xl mx-auto w-full">{children}</main>
          <CommandMenu />
        </body>
      </html>
    </ClerkProvider>
  );
}
