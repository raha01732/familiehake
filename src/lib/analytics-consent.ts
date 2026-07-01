// src/lib/analytics-consent.ts
// Client-seitige Einwilligung für nicht-notwendige Analytics (PostHog:
// Autocapture, Identify, Session Recording) und Sentry Session Replay.
// Standard: deaktiviert, bis der Nutzer über AnalyticsConsentBanner zustimmt.
// Bewusst framework-frei, damit es sowohl in instrumentation-client.ts
// (läuft vor React) als auch in Client-Komponenten nutzbar ist.
export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_COOKIE = "analytics_consent";

export function readAnalyticsConsentCookie(): AnalyticsConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ANALYTICS_CONSENT_COOKIE}=([^;]*)`)
  );
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "granted" || value === "denied" ? value : null;
}

export function writeAnalyticsConsentCookie(value: AnalyticsConsent) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // 1 Jahr
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}
