// src/components/AnalyticsConsentBanner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { APP_NAME } from "@/lib/app-name";
import { readAnalyticsConsentCookie, type AnalyticsConsent } from "@/lib/analytics-consent";
import { decideAnalyticsConsent, syncAnalyticsConsentWithServer } from "@/lib/apply-analytics-consent";

/**
 * Opt-in-Banner für nicht notwendige Analytics (PostHog) und Sentry Session
 * Replay. Beide sind standardmäßig deaktiviert (siehe instrumentation-client.ts)
 * und werden hier ohne Reload nachträglich aktiviert, sobald zugestimmt wird.
 * Für angemeldete Nutzer wird die Entscheidung geräteübergreifend im Profil
 * gespiegelt (siehe /api/analytics-consent).
 */
export default function AnalyticsConsentBanner() {
  const { isSignedIn } = useUser();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cookieValue = readAnalyticsConsentCookie();

    async function resolve() {
      const finalValue = isSignedIn ? await syncAnalyticsConsentWithServer(cookieValue) : cookieValue;
      if (!cancelled) setVisible(finalValue === null);
    }
    void resolve();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  function decide(value: AnalyticsConsent) {
    decideAnalyticsConsent(value, Boolean(isSignedIn));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[600] border-t p-4 shadow-2xl backdrop-blur-xl sm:p-5"
      style={{
        borderColor: "hsl(var(--border))",
        background: "hsl(var(--card) / 0.97)",
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>
          <strong>Analytics & Fehleraufzeichnung:</strong> Mit deiner Zustimmung nutzen wir
          PostHog (Nutzungsstatistiken) und Sentry Session Replay (Bildschirmaufzeichnung bei
          Fehlern), um Probleme schneller zu finden und {APP_NAME} für die ganze Familie zu
          verbessern. Ohne Zustimmung funktioniert die Plattform genauso — es werden dann nur
          technisch notwendige Daten verarbeitet. Details in der{" "}
          <Link href="/legal/privacy" style={{ color: "hsl(var(--primary))" }}>
            Datenschutzerklärung
          </Link>
          . Du kannst deine Wahl jederzeit in den Kontoeinstellungen ändern.
        </p>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:opacity-80"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            Nur Notwendiges
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="brand-button rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Zustimmen
          </button>
        </div>
      </div>
    </div>
  );
}
