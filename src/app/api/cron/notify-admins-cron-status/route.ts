// src/app/api/cron/notify-admins-cron-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { reportError } from "@/lib/sentry";
import { sendEmail, resolveUserEmail, escapeHtml } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CronRunRow = {
  job_name: string;
  success: boolean;
  skipped: boolean;
  started_at: string;
  finished_at: string;
  duration_ms: number | null;
  error_message: string | null;
};

type JobSummary = {
  jobName: string;
  total: number;
  successes: number;
  failures: number;
  skipped: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
};

const WINDOW_HOURS = 24;

function summarize(rows: CronRunRow[]): JobSummary[] {
  const byJob = new Map<string, CronRunRow[]>();
  for (const r of rows) {
    if (!byJob.has(r.job_name)) byJob.set(r.job_name, []);
    byJob.get(r.job_name)!.push(r);
  }

  const out: JobSummary[] = [];
  for (const [jobName, list] of byJob.entries()) {
    list.sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1));
    const successes = list.filter((r) => r.success && !r.skipped).length;
    const failures = list.filter((r) => !r.success && !r.skipped).length;
    const skipped = list.filter((r) => r.skipped).length;
    const lastSuccess = list.find((r) => r.success && !r.skipped) ?? null;
    const lastFailure = list.find((r) => !r.success && !r.skipped) ?? null;

    out.push({
      jobName,
      total: list.length,
      successes,
      failures,
      skipped,
      lastSuccess: lastSuccess?.finished_at ?? null,
      lastFailure: lastFailure?.finished_at ?? null,
      lastError: lastFailure?.error_message ?? null,
      lastDurationMs: list[0]?.duration_ms ?? null,
    });
  }

  out.sort((a, b) => {
    if (a.failures !== b.failures) return b.failures - a.failures;
    return a.jobName.localeCompare(b.jobName);
  });
  return out;
}

function formatDateBerlin(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderHtml(summaries: JobSummary[], windowStart: string, hasFailures: boolean): string {
  const rows = summaries
    .map((s) => {
      const statusBg = s.failures > 0 ? "#fee2e2" : s.successes === 0 ? "#fef3c7" : "#dcfce7";
      const statusColor = s.failures > 0 ? "#991b1b" : s.successes === 0 ? "#92400e" : "#166534";
      const statusLabel = s.failures > 0 ? "FEHLER" : s.successes === 0 ? "KEIN RUN" : "OK";
      return `
        <tr style="border-bottom:1px solid #e4e4e7">
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#18181b">${escapeHtml(s.jobName)}</td>
          <td style="padding:10px 12px;text-align:center">
            <span style="display:inline-block;padding:2px 8px;border-radius:6px;background:${statusBg};color:${statusColor};font-size:11px;font-weight:700;letter-spacing:0.04em">${statusLabel}</span>
          </td>
          <td style="padding:10px 12px;text-align:center;font-size:12px;color:#18181b">${s.successes} / ${s.failures}${s.skipped > 0 ? ` <span style="color:#71717a">(${s.skipped} sk)</span>` : ""}</td>
          <td style="padding:10px 12px;font-size:11px;color:#52525b">${escapeHtml(formatDateBerlin(s.lastSuccess))}</td>
          <td style="padding:10px 12px;font-size:11px;color:${s.lastFailure ? "#991b1b" : "#a1a1aa"}">
            ${escapeHtml(formatDateBerlin(s.lastFailure))}
            ${s.lastError ? `<div style="margin-top:2px;font-family:monospace;font-size:10px;color:#b91c1c;overflow:hidden;text-overflow:ellipsis;max-width:200px;white-space:nowrap">${escapeHtml(s.lastError.slice(0, 120))}</div>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  const emptyHint =
    summaries.length === 0
      ? `<p style="padding:16px;color:#71717a;font-size:13px;text-align:center">Keine Cron-Läufe in den letzten ${WINDOW_HOURS} Stunden.</p>`
      : "";

  const banner = hasFailures
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#fee2e2;border:1px solid #fecaca;border-radius:10px;color:#991b1b;font-size:13px;font-weight:600">⚠️ Es gab fehlgeschlagene Cron-Läufe in den letzten 24 Stunden.</div>`
    : `<div style="margin:0 0 16px;padding:12px 14px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:13px;font-weight:600">✅ Alle Cron-Jobs laufen fehlerfrei.</div>`;

  return `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;margin:0;padding:24px;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
    <tr><td style="padding:24px">
      <p style="margin:0 0 4px;color:#71717a;font-size:12px;letter-spacing:0.1em;text-transform:uppercase">FamilieHake • Admin</p>
      <h1 style="margin:0 0 4px;color:#18181b;font-size:20px">Cron-Status Tagesreport</h1>
      <p style="margin:0 0 20px;color:#52525b;font-size:12px">Fenster: letzte ${WINDOW_HOURS} Stunden (ab ${escapeHtml(formatDateBerlin(windowStart))})</p>
      ${banner}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#fafafa">
            <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Job</th>
            <th style="padding:10px 12px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Status</th>
            <th style="padding:10px 12px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Erfolg / Fehler</th>
            <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Letzter Erfolg</th>
            <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Letzter Fehler</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${emptyHint}
    </td></tr>
  </table>
</body></html>`;
}

function renderText(summaries: JobSummary[], windowStart: string): string {
  const header = `FamilieHake – Cron-Status (letzte ${WINDOW_HOURS} Std, ab ${formatDateBerlin(windowStart)})\n`;
  if (summaries.length === 0) return `${header}\nKeine Läufe erfasst.`;
  const lines = summaries.map((s) => {
    const flag = s.failures > 0 ? "FEHLER" : s.successes === 0 ? "KEIN RUN" : "OK";
    const err = s.lastError ? `  last-error: ${s.lastError.slice(0, 160)}` : "";
    return `- [${flag}] ${s.jobName}  ok=${s.successes} err=${s.failures} sk=${s.skipped}  last-ok=${formatDateBerlin(s.lastSuccess)}  last-err=${formatDateBerlin(s.lastFailure)}\n${err}`;
  });
  return `${header}\n${lines.join("\n")}`;
}

/** Returns the Clerk user IDs of admins + superadmins. */
async function listAdminUserIds(): Promise<string[]> {
  const sb = createAdminClient();

  const { data: roles } = await sb
    .from("roles")
    .select("id, name, is_superadmin");
  const adminRoleIds = (roles ?? [])
    .filter((r) => r.is_superadmin || r.name === "admin")
    .map((r) => r.id);

  const ids = new Set<string>();
  const primary = process.env.PRIMARY_SUPERADMIN_ID;
  if (primary) ids.add(primary);

  if (adminRoleIds.length > 0) {
    const { data: mapping } = await sb
      .from("user_roles")
      .select("user_id")
      .in("role_id", adminRoleIds);
    for (const row of mapping ?? []) {
      if (row.user_id) ids.add(row.user_id);
    }
  }

  return Array.from(ids);
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: "notify-admins-cron-status",
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
    const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: runs, error } = await sb
      .from("cron_job_runs")
      .select("job_name, success, skipped, started_at, finished_at, duration_ms, error_message")
      .gte("finished_at", windowStart)
      .order("finished_at", { ascending: false })
      .limit(2000);

    if (error) throw error;

    const summaries = summarize((runs ?? []) as CronRunRow[]);
    const hasFailures = summaries.some((s) => s.failures > 0);

    const adminIds = await listAdminUserIds();

    const html = renderHtml(summaries, windowStart, hasFailures);
    const text = renderText(summaries, windowStart);
    const subject = hasFailures
      ? "⚠️ Cron-Status: Fehler in den letzten 24h"
      : "✅ Cron-Status: alles grün";

    const emails: string[] = [];
    for (const uid of adminIds) {
      const email = await resolveUserEmail(uid);
      if (email) emails.push(email);
    }

    let mailResult: { ok: boolean; skipped?: boolean; error?: string } = {
      ok: false,
      skipped: true,
      error: "no_recipients",
    };
    if (emails.length > 0) {
      mailResult = await sendEmail({
        to: emails,
        subject,
        html,
        text,
      });
    }

    await logCronRun({
      jobName: "notify-admins-cron-status",
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: {
        window_hours: WINDOW_HOURS,
        jobs_observed: summaries.length,
        has_failures: hasFailures,
        admin_count: adminIds.length,
        recipients: emails.length,
        mail_skipped: Boolean(mailResult.skipped),
        mail_ok: mailResult.ok,
      },
    });

    return NextResponse.json({
      ok: true,
      jobs: summaries.length,
      recipients: emails.length,
      has_failures: hasFailures,
      mail: mailResult,
    });
  } catch (error) {
    await logCronRun({
      jobName: "notify-admins-cron-status",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "notify_admins_cron_status_failed",
    });
    reportError(error, { cron: "notify-admins-cron-status" });
    return NextResponse.json(
      { ok: false, error: "notify_admins_cron_status_failed" },
      { status: 500 }
    );
  }
}

