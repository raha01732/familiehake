// src/lib/calendar-feed.ts
// Hilfen für externe Kalender-Feeds: URL-Validierung (mit einfachem
// SSRF-Schutz) und gecachter ICS-Abruf über Redis (kurzer TTL für hohe
// Aktualität ohne externe Server zu überlasten).
import { createHash } from "node:crypto";
import { getCachedJson, setCachedJson } from "@/lib/redis";

export const FEED_CACHE_TTL = 90; // Sekunden
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ICS_BYTES = 5 * 1024 * 1024;

/**
 * Validiert und normalisiert eine Feed-URL. webcal:// wird zu https://.
 * Offensichtlich interne/loopback Ziele werden abgelehnt (best effort).
 * Gibt null zurück, wenn die URL ungültig/unzulässig ist.
 */
export function normalizeFeedUrl(raw: string): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith("webcal://")) s = "https://" + s.slice("webcal://".length);

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return null;
  }

  return u.toString();
}

export type FeedFetchResult = {
  ics: string | null;
  error: string | null;
  fromCache: boolean;
};

/** Holt den ICS-Text einer Feed-URL (Redis-Cache, kurzer TTL). */
export async function fetchIcsCached(url: string): Promise<FeedFetchResult> {
  const key = `cache:calfeed:${createHash("sha256").update(url).digest("hex")}`;

  const cached = await getCachedJson<string>(key);
  if (cached != null) return { ics: cached, error: null, fromCache: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Hearth-Calendar/1.0",
        Accept: "text/calendar, text/plain, */*",
      },
    });
    if (!res.ok) return { ics: null, error: `HTTP ${res.status}`, fromCache: false };

    const text = await res.text();
    const ics = text.length > MAX_ICS_BYTES ? text.slice(0, MAX_ICS_BYTES) : text;
    if (!ics.includes("BEGIN:VCALENDAR")) {
      return { ics: null, error: "Kein gültiger ICS-Feed", fromCache: false };
    }

    await setCachedJson(key, ics, FEED_CACHE_TTL);
    return { ics, error: null, fromCache: false };
  } catch (e) {
    const error =
      e instanceof Error && e.name === "AbortError" ? "Zeitüberschreitung" : "Abruf fehlgeschlagen";
    return { ics: null, error, fromCache: false };
  } finally {
    clearTimeout(timeout);
  }
}

/** Normalisiert eine Farb-Eingabe (HSL-Hue als String 0–360). */
export function normalizeFeedColor(input: unknown): string {
  const n = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(n)) return "221";
  return String(((n % 360) + 360) % 360);
}
