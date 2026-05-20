// src/app/api/cron/cleanup-notifications/route.ts
// Verschiebt alte Benachrichtigungen ins Archiv (statt sie zu löschen):
//   - gelesene  -> nach NOTIFICATIONS_READ_RETENTION_DAYS   (Default 4)
//   - ungelesene -> nach NOTIFICATIONS_UNREAD_RETENTION_DAYS (Default 30)
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAME = "cleanup-notifications";
const BATCH_LIMIT = 2000;
const COLUMNS = "id, user_id, kind, title, body, link, read_at, created_at, system_message_id";

type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  system_message_id: string | null;
};

function retentionDays(envValue: string | undefined, fallback: number): number {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function cutoffIso(days: number): string {
  // Ohne Millisekunden für saubere PostgREST-Filterwerte.
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Kopiert Zeilen ins Archiv (idempotent) und entfernt sie aus notifications. */
async function moveToArchive(
  sb: ReturnType<typeof createAdminClient>,
  rows: NotificationRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const archivedAt = new Date().toISOString();
  const { error: insErr } = await sb
    .from("notifications_archive")
    .upsert(
      rows.map((r) => ({ ...r, archived_at: archivedAt })),
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (insErr) throw insErr;

  const ids = rows.map((r) => r.id);
  const { error: delErr } = await sb.from("notifications").delete().in("id", ids);
  if (delErr) throw delErr;
  return ids.length;
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

  try {
    const sb = createAdminClient();
    const readDays = retentionDays(process.env.NOTIFICATIONS_READ_RETENTION_DAYS, 4);
    const unreadDays = retentionDays(process.env.NOTIFICATIONS_UNREAD_RETENTION_DAYS, 30);
    const readCutoff = cutoffIso(readDays);
    const unreadCutoff = cutoffIso(unreadDays);

    // Gelesene, die älter als readDays sind
    const { data: readRows, error: readErr } = await sb
      .from("notifications")
      .select(COLUMNS)
      .not("read_at", "is", null)
      .lt("created_at", readCutoff)
      .limit(BATCH_LIMIT);
    if (readErr) throw readErr;

    // Ungelesene, die älter als unreadDays sind
    const { data: unreadRows, error: unreadErr } = await sb
      .from("notifications")
      .select(COLUMNS)
      .is("read_at", null)
      .lt("created_at", unreadCutoff)
      .limit(BATCH_LIMIT);
    if (unreadErr) throw unreadErr;

    const archivedRead = await moveToArchive(sb, (readRows ?? []) as NotificationRow[]);
    const archivedUnread = await moveToArchive(sb, (unreadRows ?? []) as NotificationRow[]);

    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: {
        read_retention_days: readDays,
        unread_retention_days: unreadDays,
        archived_read: archivedRead,
        archived_unread: archivedUnread,
        archived_total: archivedRead + archivedUnread,
      },
    });

    return NextResponse.json({
      ok: true,
      archivedRead,
      archivedUnread,
      archivedTotal: archivedRead + archivedUnread,
    });
  } catch (error) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "cleanup_notifications_failed",
    });
    reportError(error, { cron: JOB_NAME });
    return NextResponse.json({ ok: false, error: "cleanup_notifications_failed" }, { status: 500 });
  }
}
