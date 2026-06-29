// src/lib/clerk-activity.ts
//
// Geteilte Typen & Helfer rund um die Clerk-Aktivitäts-Historie.
// Clerk löscht Session-/Aktivitäts-Logs nach ~24h; der Cron
// /api/cron/clerk-activity-sync spiegelt sie nach Supabase
// (Tabellen clerk_user_sessions / clerk_user_state). Diese Lib kapselt
// das Normalisieren einer rohen Clerk-Session und das Lesen der
// gespiegelten Historie für die Startseiten-Kachel.

import { createAdminClient } from "@/lib/supabase/admin";

/** Normalisierte Geräte-/Sitzungs-Info, wie sie UI & Cron verwenden. */
export type AccountSession = {
  sessionId: string;
  status: string;
  browser: string;
  device: string;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  isMobile: boolean;
  /** ms-Epoch der letzten Aktivität (Clerk) bzw. null. */
  lastActiveAt: number | null;
  /** ms-Epoch, wann wir die Session zum ersten Mal gesehen haben. */
  firstSeenAt: number | null;
};

export type AccountActivity = {
  lastSignInAt: number | null;
  locked: boolean;
  /** Aktive Sitzungen, neueste zuerst. */
  sessions: AccountSession[];
};

/**
 * Clerk liefert Timestamps mal als ms-, mal als s-Epoch oder ISO-String.
 * Vereinheitlicht auf ms-Epoch (oder null).
 */
export function normalizeClerkTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Wandelt eine rohe Clerk-Session (aus getSessionList) in AccountSession. */
export function mapClerkSession(raw: any): AccountSession {
  const act = raw?.latestActivity ?? raw?.latest_activity ?? {};
  const browser = [act.browserName ?? act.browser_name, act.browserVersion ?? act.browser_version]
    .filter(Boolean)
    .join(" ")
    .trim();
  const isMobile = Boolean(act.isMobile ?? act.is_mobile);
  return {
    sessionId: String(raw?.id ?? ""),
    status: String(raw?.status ?? "unknown"),
    browser: browser || "Unbekannter Browser",
    device: act.deviceType ?? act.device_type ?? (isMobile ? "Mobil" : "Desktop"),
    ipAddress: act.ipAddress ?? act.ip_address ?? null,
    city: act.city ?? null,
    country: act.country ?? null,
    isMobile,
    lastActiveAt:
      normalizeClerkTimestamp(raw?.lastActiveAt ?? raw?.last_active_at) ??
      normalizeClerkTimestamp(raw?.updatedAt ?? raw?.updated_at),
    firstSeenAt: null,
  };
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Liest die gespiegelte Konto-Aktivität eines Nutzers aus unserer DB
 * (nicht live aus Clerk) — schnell, dauerhaft und ohne Clerk-Rate-Limits
 * pro Seitenaufruf. Liefert null, wenn nichts vorliegt / Tabellen fehlen.
 */
export async function getMyAccountActivity(userId: string): Promise<AccountActivity | null> {
  try {
    const sb = createAdminClient();

    const [{ data: sessionRows }, { data: stateRow }] = await Promise.all([
      sb
        .from("clerk_user_sessions")
        .select("session_id,status,browser,device,ip_address,city,country,is_mobile,last_active_at,first_seen_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("last_active_at", { ascending: false, nullsFirst: false })
        .limit(10),
      sb
        .from("clerk_user_state")
        .select("last_sign_in_at,locked")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const sessions: AccountSession[] = (sessionRows ?? []).map((row: any) => ({
      sessionId: row.session_id,
      status: row.status ?? "active",
      browser: row.browser ?? "Unbekannter Browser",
      device: row.device ?? "Desktop",
      ipAddress: row.ip_address ?? null,
      city: row.city ?? null,
      country: row.country ?? null,
      isMobile: Boolean(row.is_mobile),
      lastActiveAt: toMs(row.last_active_at),
      firstSeenAt: toMs(row.first_seen_at),
    }));

    return {
      lastSignInAt: toMs(stateRow?.last_sign_in_at),
      locked: Boolean(stateRow?.locked),
      sessions,
    };
  } catch (error) {
    console.error("[clerk-activity] getMyAccountActivity failed", error);
    return null;
  }
}
