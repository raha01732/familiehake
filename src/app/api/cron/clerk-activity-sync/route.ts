// src/app/api/cron/clerk-activity-sync/route.ts
//
// Spiegelt Clerks kurzlebige Session-/Aktivitäts-Logs (Retention ~24h)
// nach Supabase, damit eine dauerhafte Login-/Geräte-Historie entsteht.
//
// Läuft auf Vercel Hobby 2×/Tag (00:00 & 12:00, zwei Einträge in
// vercel.json auf denselben Pfad). Deshalb bewusst OHNE
// claimDailyCronRun — sonst würde der zweite Lauf als „heute schon
// gelaufen" übersprungen.
//
// Erkennt zwischen zwei Läufen:
//   • neue Session-ID  -> „Neue Anmeldung erkannt" (Audit + Benachrichtigung)
//   • frisch gesperrtes Konto (Clerks Brute-Force-Schutz) -> Sicherheits-Alert
// Der erste Lauf pro Nutzer bildet nur die Baseline (keine Alerts).

import * as Sentry from "@sentry/nextjs";
import { clerkClient } from "@clerk/nextjs/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { mapClerkSession, normalizeClerkTimestamp, type AccountSession } from "@/lib/clerk-activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAME = "clerk-activity-sync";
const CLERK_PAGE_SIZE = 100;

function isoOrNull(ms: number | null): string | null {
  return ms != null ? new Date(ms).toISOString() : null;
}

function locationLabel(s: AccountSession): string | null {
  const parts = [s.city, s.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

type SyncUser = { id: string; email: string | null; lastSignInAt: number | null; locked: boolean };

async function listUsers(client: Awaited<ReturnType<typeof clerkClient>>): Promise<SyncUser[]> {
  const users: SyncUser[] = [];
  let offset = 0;

  while (true) {
    const page = (await client.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
    })) as unknown as { data?: any[]; totalCount?: number };

    const batch = Array.isArray(page.data) ? page.data : [];
    if (batch.length === 0) break;

    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.emailAddresses?.[0]?.emailAddress ?? u.primaryEmailAddress?.emailAddress ?? null,
        lastSignInAt: normalizeClerkTimestamp(u.lastSignInAt ?? u.last_sign_in_at),
        locked: Boolean(u.locked),
      });
    }

    const total = typeof page.totalCount === "number" ? page.totalCount : 0;
    offset += batch.length;
    if (offset >= total || batch.length < CLERK_PAGE_SIZE) break;
  }

  return users;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "unauthorized",
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Clerk nicht konfiguriert -> sauber überspringen (lokale Dev-Umgebung).
  if (!process.env.CLERK_SECRET_KEY) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { reason: "clerk_not_configured" },
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "clerk_not_configured" });
  }

  try {
    const client = await clerkClient();
    const sb = createAdminClient();
    const users = await listUsers(client);

    let sessionsUpserted = 0;
    let newDeviceAlerts = 0;
    let lockAlerts = 0;
    let usersBaselined = 0;

    for (const user of users) {
      // Vorzustand laden: existierende Session-IDs + letzter Konto-Zustand.
      const [{ data: knownRows }, { data: stateRow }] = await Promise.all([
        sb.from("clerk_user_sessions").select("session_id").eq("user_id", user.id),
        sb
          .from("clerk_user_state")
          .select("locked")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const isFirstRun = !stateRow; // noch nie gesehen -> nur Baseline, keine Alerts
      if (isFirstRun) usersBaselined += 1;
      const knownSessionIds = new Set<string>((knownRows ?? []).map((r: any) => r.session_id));

      // Aktuelle Sessions von Clerk holen & normalisieren.
      const raw = (await client.sessions.getSessionList({
        userId: user.id,
        limit: 100,
      })) as unknown as { data?: any[] };
      const sessions = (raw.data ?? []).map(mapClerkSession).filter((s) => s.sessionId);

      for (const s of sessions) {
        // first_seen_at bewusst NICHT mit-upserten: bleibt beim Update
        // erhalten und wird beim Insert vom DB-Default (now()) gesetzt.
        const { error } = await sb.from("clerk_user_sessions").upsert(
          {
            session_id: s.sessionId,
            user_id: user.id,
            status: s.status,
            browser: s.browser,
            device: s.device,
            ip_address: s.ipAddress,
            city: s.city,
            country: s.country,
            is_mobile: s.isMobile,
            last_active_at: isoOrNull(s.lastActiveAt),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "session_id" }
        );
        if (!error) sessionsUpserted += 1;

        const isNew = !knownSessionIds.has(s.sessionId);
        if (isNew && !isFirstRun && s.status === "active") {
          const loc = locationLabel(s);
          await logAudit({
            action: "login_new_device",
            actorUserId: user.id,
            actorEmail: user.email,
            target: user.id,
            detail: {
              sessionId: s.sessionId,
              browser: s.browser,
              device: s.device,
              ipAddress: s.ipAddress,
              location: loc,
            },
          });
          await notify({
            userId: user.id,
            kind: "security",
            title: "Neue Anmeldung erkannt",
            body:
              `Es wurde eine neue Anmeldung bei deinem Konto festgestellt:\n` +
              `${s.browser} (${s.device})${loc ? ` aus ${loc}` : ""}.\n\n` +
              `Warst das nicht du? Ändere umgehend dein Passwort und melde fremde Geräte ab.`,
            link: "/",
          });
          newDeviceAlerts += 1;
        }
      }

      // Konto-Sperre erkennen (Clerks Schutz bei zu vielen Fehlversuchen).
      const wasLocked = Boolean(stateRow?.locked);
      if (!isFirstRun && user.locked && !wasLocked) {
        await logAudit({
          action: "account_locked",
          actorUserId: user.id,
          actorEmail: user.email,
          target: user.id,
          detail: { reason: "clerk_lockout" },
        });
        await notify({
          userId: user.id,
          kind: "security",
          title: "Konto vorübergehend gesperrt",
          body:
            "Dein Konto wurde nach mehreren fehlgeschlagenen Anmeldeversuchen " +
            "vorübergehend gesperrt. Falls du das nicht warst, könnte jemand " +
            "versucht haben, sich anzumelden.",
          link: "/",
        });
        lockAlerts += 1;
      } else if (!isFirstRun && !user.locked && wasLocked) {
        await logAudit({
          action: "account_unlocked",
          actorUserId: user.id,
          actorEmail: user.email,
          target: user.id,
          detail: { reason: "clerk_lockout_cleared" },
        });
      }

      // Zustand fortschreiben.
      await sb.from("clerk_user_state").upsert(
        {
          user_id: user.id,
          last_sign_in_at: isoOrNull(user.lastSignInAt),
          locked: user.locked,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    const durationMs = Date.now() - startedAt;
    const details = {
      users: users.length,
      usersBaselined,
      sessionsUpserted,
      newDeviceAlerts,
      lockAlerts,
    };

    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      startedAt,
      durationMs,
      details,
    });

    return NextResponse.json({ ok: true, ...details });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Sentry.captureException(error, { tags: { cron: JOB_NAME } });
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
