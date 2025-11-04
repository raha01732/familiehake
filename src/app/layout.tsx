import "./globals.css";
import { Header } from "../components/Header";
import { ClerkProvider } from "@clerk/nextjs";
import React from "react";
import CommandMenu from "@/components/CommandMenu";

export const metadata = {
  title: "Private Tools",
  description: "Interner Zugriff. Login erforderlich."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="de" className="bg-zinc-950 text-zinc-100">
        <body className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 flex flex-col p-6 gap-6 max-w-5xl w-full mx-auto">
            {children}
          </main>
          <footer className="text-xs text-zinc-600 text-center py-8">
            © {new Date().getFullYear()} Private Area
          </footer>
          <CommandMenu />
        </body>
      </html>
    </ClerkProvider>
  );
}
