// src/components/AnalyticsConsentSettings.tsx
"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { APP_NAME } from "@/lib/app-name";
import { readAnalyticsConsentCookie, type AnalyticsConsent } from "@/lib/analytics-consent";
import { decideAnalyticsConsent, syncAnalyticsConsentWithServer } from "@/lib/apply-analytics-consent";

export default function AnalyticsConsentSettings() {
  const { isSignedIn } = useUser();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cookieValue = readAnalyticsConsentCookie();

    async function resolve() {
      const finalValue = isSignedIn ? await syncAnalyticsConsentWithServer(cookieValue) : cookieValue;
      if (!cancelled) setConsent(finalValue);
    }
    void resolve();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  function decide(value: AnalyticsConsent) {
    decideAnalyticsConsent(value, Boolean(isSignedIn));
    setConsent(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="w-full p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Analytics & Fehleraufzeichnung
        </h1>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Steuere, ob PostHog (Nutzungsstatistiken) und Sentry Session Replay
          (Bildschirmaufzeichnung bei Fehlern) für dich aktiv sind. {APP_NAME} funktioniert in
          beiden Fällen gleich.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => decide("denied")}
          className="flex-1 rounded-xl border px-4 py-3 text-left text-sm font-medium transition hover:opacity-80"
          style={{
            borderColor:
              consent === "denied" ? "hsl(var(--primary))" : "hsl(var(--border))",
            background: consent === "denied" ? "hsl(var(--primary) / 0.08)" : "transparent",
            color: "hsl(var(--foreground))",
          }}
        >
          Nur Notwendiges
          {consent === "denied" && <Check className="ml-2 inline h-4 w-4" style={{ color: "hsl(var(--primary))" }} />}
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className="flex-1 rounded-xl border px-4 py-3 text-left text-sm font-medium transition hover:opacity-80"
          style={{
            borderColor:
              consent === "granted" ? "hsl(var(--primary))" : "hsl(var(--border))",
            background: consent === "granted" ? "hsl(var(--primary) / 0.08)" : "transparent",
            color: "hsl(var(--foreground))",
          }}
        >
          Analytics & Session Replay erlauben
          {consent === "granted" && <Check className="ml-2 inline h-4 w-4" style={{ color: "hsl(var(--primary))" }} />}
        </button>
      </div>

      {saved && (
        <p className="mt-3 text-xs" style={{ color: "hsl(var(--primary))" }}>
          Gespeichert.
        </p>
      )}
    </div>
  );
}
