// src/app/legal/layout.tsx
import Link from "next/link";
import React from "react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1rem 5rem",
      }}
    >
      <div style={{ marginBottom: "2rem" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.82rem",
            color: "hsl(var(--muted-foreground))",
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          ← Zurück zur Startseite
        </Link>
      </div>
      {children}
      <div
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid hsl(var(--border))",
          display: "flex",
          gap: "1.5rem",
          fontSize: "0.78rem",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <Link href="/legal/terms" style={{ color: "hsl(var(--muted-foreground))", textDecoration: "none" }}>
          Nutzungsbedingungen
        </Link>
        <Link href="/legal/privacy" style={{ color: "hsl(var(--muted-foreground))", textDecoration: "none" }}>
          Datenschutzerklärung
        </Link>
      </div>
    </div>
  );
}
