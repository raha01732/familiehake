// src/lib/cron-status-report.ts
// Baut den täglichen Cron-Status-Report (HTML + Text + Betreff) inkl.
// Audit-Log-Abschnitt. Wird von der Cron-Route UND der Admin-Aktion
// „Systemreport erneut senden" genutzt.
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/mail";
import { APP_NAME } from "@/lib/app-name";
import {
  describeAuditEvent,
  summarizeAuditEvents,
  formatDateDe,
  type AuditRow,
  type AuditNameLookups,
} from "@/lib/audit-format";

export const WINDOW_HOURS = 24;
const AUDIT_LIMIT = 500;

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

function formatTimeBerlin(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Audit-Log: Laden, Anreichern, Rendern ─────────────────────────────

async function loadAuditEvents(
  sb: ReturnType<typeof createAdminClient>,
  windowStart: string
): Promise<AuditRow[]> {
  const { data, error } = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .gte("ts", windowStart)
    .order("ts", { ascending: true })
    .limit(AUDIT_LIMIT);
  if (error) {
    console.error("[cron-status-report] audit load error:", error.message);
    return [];
  }
  return (data ?? []) as AuditRow[];
}

function collectIds(events: AuditRow[], keys: string[]): number[] {
  const ids = new Set<number>();
  for (const ev of events) {
    const d = ev.detail;
    if (!d) continue;
    for (const key of keys) {
      const v = d[key];
      if (typeof v === "number" && Number.isFinite(v)) ids.add(v);
      else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) ids.add(Number(v));
    }
  }
  return Array.from(ids);
}

async function buildAuditLookups(
  sb: ReturnType<typeof createAdminClient>,
  events: AuditRow[]
): Promise<AuditNameLookups> {
  const employeeIds = collectIds(events, ["employeeId", "fromEmployeeId", "toEmployeeId"]);
  const staffIds = collectIds(events, ["staffId"]);
  const showIds = collectIds(events, ["showId"]);

  const [employeesRes, staffRes, showsRes] = await Promise.all([
    employeeIds.length
      ? sb.from("dienstplan_employees").select("id, name").in("id", employeeIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    staffIds.length
      ? sb.from("cinema_cleaning_staff").select("id, name").in("id", staffIds)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    showIds.length
      ? sb
          .from("cinema_cleaning_shows")
          .select("id, show_date, hall_number, movie_title")
          .in("id", showIds)
      : Promise.resolve({
          data: [] as { id: number; show_date: string; hall_number: number; movie_title: string | null }[],
        }),
  ]);

  const employees = new Map<number, string>();
  for (const row of (employeesRes.data ?? []) as { id: number; name: string }[]) {
    employees.set(row.id, row.name);
  }
  const staff = new Map<number, string>();
  for (const row of (staffRes.data ?? []) as { id: number; name: string }[]) {
    staff.set(row.id, row.name);
  }
  const shows = new Map<number, string>();
  for (const row of (showsRes.data ?? []) as {
    id: number;
    show_date: string;
    hall_number: number;
    movie_title: string | null;
  }[]) {
    const label =
      row.movie_title?.trim() ||
      `Saal ${row.hall_number}${row.show_date ? ` (${formatDateDe(row.show_date)})` : ""}`;
    shows.set(row.id, label);
  }

  return { employees, staff, shows };
}

function renderAuditSectionHtml(events: AuditRow[], lookups: AuditNameLookups): string {
  const heading = `<h2 style="margin:28px 0 4px;color:#18181b;font-size:16px">Aktivitäten (letzte ${WINDOW_HOURS} Std)</h2>`;

  if (events.length === 0) {
    return `${heading}<p style="margin:0;color:#71717a;font-size:13px">Keine protokollierten Aktivitäten im Zeitraum.</p>`;
  }

  const summary = summarizeAuditEvents(events);
  const summaryChips = summary
    .map(
      (s) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border-radius:9999px;background:#f4f4f5;border:1px solid #e4e4e7;font-size:12px;color:#3f3f46">${escapeHtml(s.label)} <strong style="color:#18181b">${s.count}</strong></span>`
    )
    .join("");

  const rows = [...events]
    .reverse()
    .map((ev) => {
      const time = formatTimeBerlin(ev.ts);
      const actor = ev.actor_email ?? "System";
      const text = describeAuditEvent(ev, lookups);
      return `
        <tr style="border-bottom:1px solid #f1f1f3">
          <td style="padding:7px 10px;font-size:11px;color:#a1a1aa;white-space:nowrap;vertical-align:top">${escapeHtml(time)}</td>
          <td style="padding:7px 10px;font-size:13px;color:#18181b;vertical-align:top">${escapeHtml(text)}</td>
          <td style="padding:7px 10px;font-size:11px;color:#71717a;white-space:nowrap;vertical-align:top">${escapeHtml(actor)}</td>
        </tr>`;
    })
    .join("");

  const cappedHint =
    events.length >= AUDIT_LIMIT
      ? `<p style="margin:8px 0 0;color:#a1a1aa;font-size:11px">Hinweis: auf die letzten ${AUDIT_LIMIT} Ereignisse begrenzt.</p>`
      : "";

  return `
    ${heading}
    <p style="margin:0 0 8px;color:#52525b;font-size:12px">${events.length} Ereignis(se) insgesamt</p>
    <div style="margin:0 0 14px">${summaryChips}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#fafafa">
          <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Zeit</th>
          <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Ereignis</th>
          <th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#71717a">Wer</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${cappedHint}`;
}

function renderAuditText(events: AuditRow[], lookups: AuditNameLookups): string {
  const header = `\n\nAktivitäten (letzte ${WINDOW_HOURS} Std)`;
  if (events.length === 0) return `${header}\nKeine protokollierten Aktivitäten im Zeitraum.`;

  const summary = summarizeAuditEvents(events)
    .map((s) => `${s.label}: ${s.count}`)
    .join(", ");

  const lines = [...events]
    .reverse()
    .map((ev) => {
      const time = formatTimeBerlin(ev.ts);
      const actor = ev.actor_email ?? "System";
      return `- ${time} – ${describeAuditEvent(ev, lookups)} (${actor})`;
    });

  return `${header}\nGesamt: ${events.length}\nZusammenfassung: ${summary}\n\n${lines.join("\n")}`;
}

function renderHtml(
  summaries: JobSummary[],
  windowStart: string,
  hasFailures: boolean,
  auditSectionHtml: string
): string {
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
      <p style="margin:0 0 4px;color:#71717a;font-size:12px;letter-spacing:0.1em;text-transform:uppercase">${escapeHtml(APP_NAME)} • Admin</p>
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
      ${auditSectionHtml}
    </td></tr>
  </table>
</body></html>`;
}

function renderText(summaries: JobSummary[], windowStart: string, auditText: string): string {
  const header = `${APP_NAME} – Cron-Status (letzte ${WINDOW_HOURS} Std, ab ${formatDateBerlin(windowStart)})\n`;
  const cronBlock =
    summaries.length === 0
      ? `${header}\nKeine Läufe erfasst.`
      : `${header}\n${summaries
          .map((s) => {
            const flag = s.failures > 0 ? "FEHLER" : s.successes === 0 ? "KEIN RUN" : "OK";
            const err = s.lastError ? `  last-error: ${s.lastError.slice(0, 160)}` : "";
            return `- [${flag}] ${s.jobName}  ok=${s.successes} err=${s.failures} sk=${s.skipped}  last-ok=${formatDateBerlin(s.lastSuccess)}  last-err=${formatDateBerlin(s.lastFailure)}\n${err}`;
          })
          .join("\n")}`;
  return `${cronBlock}${auditText}`;
}

/** Gibt die Clerk-User-IDs aller Admins + Superadmins zurück. */
export async function listAdminUserIds(): Promise<string[]> {
  const sb = createAdminClient();

  const { data: roles } = await sb.from("roles").select("id, name, is_superadmin");
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

export type CronStatusReport = {
  subject: string;
  html: string;
  text: string;
  hasFailures: boolean;
  jobsObserved: number;
  auditEventCount: number;
};

/** Erstellt den vollständigen Cron-Status-Report (Abfragen + Rendering). */
export async function buildCronStatusReport(): Promise<CronStatusReport> {
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

  const auditEvents = await loadAuditEvents(sb, windowStart);
  const auditLookups = await buildAuditLookups(sb, auditEvents);

  const html = renderHtml(summaries, windowStart, hasFailures, renderAuditSectionHtml(auditEvents, auditLookups));
  const text = renderText(summaries, windowStart, renderAuditText(auditEvents, auditLookups));
  const subject = hasFailures
    ? "⚠️ Cron-Status: Fehler in den letzten 24h"
    : "✅ Cron-Status: alles grün";

  return {
    subject,
    html,
    text,
    hasFailures,
    jobsObserved: summaries.length,
    auditEventCount: auditEvents.length,
  };
}
