// src/lib/apply-analytics-consent.ts
// Wendet eine Analytics-Entscheidung sofort an (ohne Reload): PostHog
// Capturing wird ein-/ausgeschaltet, Sentry Session Replay wird bei
// Zustimmung nachgeladen. Genutzt von AnalyticsConsentBanner und
// AnalyticsConsentSettings, damit beide dieselbe Logik teilen.
import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";
import { writeAnalyticsConsentCookie, type AnalyticsConsent } from "@/lib/analytics-consent";

export function applyAnalyticsConsent(value: AnalyticsConsent) {
  writeAnalyticsConsentCookie(value);
  if (value === "granted") {
    posthog.opt_in_capturing();
    Sentry.getClient()?.addIntegration(Sentry.replayIntegration());
  } else {
    posthog.opt_out_capturing();
  }
}

/**
 * Gleicht den lokalen Cookie-Stand mit dem im Profil gespeicherten Wert ab
 * (geräteübergreifend). Bei Konflikt gewinnt der Profil-Wert. Existiert nur
 * lokal ein Cookie-Wert (z.B. Entscheidung vor dem Login), wird er ins
 * Profil nachgetragen. Gibt den letztgültigen Wert zurück (oder null).
 */
export async function syncAnalyticsConsentWithServer(
  cookieValue: AnalyticsConsent | null
): Promise<AnalyticsConsent | null> {
  try {
    const res = await fetch("/api/analytics-consent", { cache: "no-store" });
    if (!res.ok) return cookieValue;
    const json = (await res.json()) as { ok: boolean; data?: { consent: AnalyticsConsent | null } };
    const dbValue = json.ok ? (json.data?.consent ?? null) : null;

    if (dbValue) {
      if (dbValue !== cookieValue) applyAnalyticsConsent(dbValue);
      return dbValue;
    }
    if (cookieValue) {
      void saveAnalyticsConsentToServer(cookieValue);
    }
    return cookieValue;
  } catch {
    return cookieValue;
  }
}

async function saveAnalyticsConsentToServer(value: AnalyticsConsent): Promise<void> {
  try {
    await fetch("/api/analytics-consent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: value }),
    });
  } catch {
    // Cookie ist bereits gesetzt; DB-Sync scheitert still, nächster Abgleich versucht es erneut.
  }
}

/** Wendet eine neue Entscheidung an und speichert sie (bei Login) im Profil. */
export function decideAnalyticsConsent(value: AnalyticsConsent, signedIn: boolean) {
  applyAnalyticsConsent(value);
  if (signedIn) void saveAnalyticsConsentToServer(value);
}
