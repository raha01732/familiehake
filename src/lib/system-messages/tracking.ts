// src/lib/system-messages/tracking.ts
// Reine URL-Builder für das Tracking von Systemnachrichten (client-sicher).

/** Redirect-Link, der einen Klick protokolliert und dann weiterleitet. */
export function trackedClickUrl(baseUrl: string, token: string, target: string): string {
  return `${baseUrl}/api/track/c/${encodeURIComponent(token)}?u=${encodeURIComponent(target)}`;
}

/** URL des 1×1-Öffnungs-Pixels. */
export function trackingPixelUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/api/track/o/${encodeURIComponent(token)}`;
}

/** Nur http(s)-Ziele zulassen (Schutz vor Missbrauch). */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
