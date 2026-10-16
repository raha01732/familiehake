// Vorbereiteter, derzeit NICHT aktivierter Cron: übernimmt den Vormonat des Dienstplans in die
// Trainingsdaten (dienstplan_history_shifts).
//
// Aktivieren (später):
//  1. Env-Variable DIENSTPLAN_AUTO_ARCHIVE=true setzen,
//  2. in vercel.json einen Eintrag ergänzen, z. B. { "path": "/api/cron/archive-dienstplan", "schedule": "0 4 2 * *" },
//  3. optional in src/lib/cron-registry.ts für das Monitoring eintragen.
// Ohne 1. und 2. passiert nichts; ein manueller Aufruf wird nur protokolliert und übersprungen.
//
// Hinweis: Automatisch archivierte Monate sind nicht manuell geprüft. Siehe Hinweis zur Rückkopplung in
// docs/dienstplaner-automation.md.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { env } from "@/lib/env";
import { archiveMonthToHistory } from "@/lib/dienstplaner/archive";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAME = "archive-dienstplan";

/** Vormonat als "YYYY-MM" in Berliner Zeit. */
function previousBerlinMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
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

  if (env().DIENSTPLAN_AUTO_ARCHIVE !== "true") {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { reason: "disabled" },
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  try {
    const month = previousBerlinMonth();
    const result = await archiveMonthToHistory(createAdminClient(), month);
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: result.ok,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: result.ok ? undefined : result.message,
      details: { month, written: result.written, alreadyPresent: result.alreadyPresent, skipped: result.skipped },
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    reportError(error, { cron: JOB_NAME });
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "archive_failed" }, { status: 500 });
  }
}
