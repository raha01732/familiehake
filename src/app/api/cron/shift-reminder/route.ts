// /workspace/familiehake/src/app/api/cron/shift-reminder/route.ts
// Sendet täglich um 07:00 Berliner Zeit eine Erinnerung an Mitarbeiter, die für
// den aktuellen Tag eine Schicht haben — als In-App-Benachrichtigung und (falls
// vom Nutzer erlaubt) als E-Mail. Voraussetzung: dienstplan_employees.user_id
// ist gesetzt.
import { NextRequest, NextResponse } from "next/server";
import { claimDailyCronRun, logCronRun } from "@/lib/cron-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { escapeHtml } from "@/lib/mail";
import { APP_NAME } from "@/lib/app-name";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAME = "shift-reminder";
const TARGET_BERLIN_HOUR = 7;

function berlinDateParts(now = new Date()): { hour: number; isoDate: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = Number(hourRaw);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    isoDate: `${year}-${month}-${day}`,
  };
}

function formatBerlinDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 5);
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

  const { hour: berlinHour, isoDate: today } = berlinDateParts();

  // Manuell ausgelöste Aufrufe (Bearer-Token) dürfen immer durch.
  const xVercelCron = req.headers.get("x-vercel-cron");
  const isVercelCron = Boolean(xVercelCron);
  if (isVercelCron && berlinHour !== TARGET_BERLIN_HOUR) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { reason: "wrong_berlin_hour", berlinHour, targetHour: TARGET_BERLIN_HOUR },
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "wrong_berlin_hour", berlinHour });
  }

  const claim = await claimDailyCronRun(JOB_NAME);
  if (!claim.ok) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: claim.errorMessage,
      details: { reason: "claim_failed", errorCode: claim.errorCode },
    });
    return NextResponse.json({ ok: false, error: "claim_daily_run_failed" }, { status: 503 });
  }
  if (!claim.claimed) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { reason: "already_claimed_today" },
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "already_claimed_today" });
  }

  try {
    const sb = createAdminClient();

    const { data: shifts, error: shiftsErr } = await sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time, break_minutes, comment")
      .eq("shift_date", today);
    if (shiftsErr) throw new Error(`shifts_query_failed: ${shiftsErr.message}`);

    const todaysShifts = (shifts ?? []).filter((s) => s.start_time && s.end_time);

    if (todaysShifts.length === 0) {
      await logCronRun({
        jobName: JOB_NAME,
        request: req,
        success: true,
        startedAt,
        durationMs: Date.now() - startedAt,
        details: { date: today, shifts: 0, notified: 0 },
      });
      return NextResponse.json({ ok: true, date: today, shifts: 0, notified: 0 });
    }

    const employeeIds = Array.from(new Set(todaysShifts.map((s) => s.employee_id)));
    const { data: employees, error: empErr } = await sb
      .from("dienstplan_employees")
      .select("id, name, user_id, is_active")
      .in("id", employeeIds);
    if (empErr) throw new Error(`employees_query_failed: ${empErr.message}`);

    const employeeMap = new Map(
      (employees ?? [])
        .filter((e) => e.user_id && e.is_active !== false)
        .map((e) => [e.id, { id: e.id as number, name: e.name as string, user_id: e.user_id as string }])
    );

    const dateLabel = formatBerlinDateLabel(today);
    let notified = 0;
    let skippedNoLink = 0;
    const errors: string[] = [];

    for (const shift of todaysShifts) {
      const emp = employeeMap.get(shift.employee_id);
      if (!emp) {
        skippedNoLink += 1;
        continue;
      }

      const start = formatTime(shift.start_time);
      const end = formatTime(shift.end_time);
      const breakLabel =
        shift.break_minutes && Number(shift.break_minutes) > 0
          ? ` (Pause: ${shift.break_minutes} min)`
          : "";
      const commentLabel = shift.comment ? `\nNotiz: ${shift.comment}` : "";

      const title = `Erinnerung: Schicht heute ${start}–${end}`;
      const body = `Hallo ${emp.name}, heute (${dateLabel}) hast du eine Schicht von ${start} bis ${end}${breakLabel}.${commentLabel}`;

      const emailHtml = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
    <tr><td style="padding:24px">
      <p style="margin:0 0 4px;color:#71717a;font-size:12px;letter-spacing:0.1em;text-transform:uppercase">${escapeHtml(APP_NAME)} · Dienstplan</p>
      <h1 style="margin:0 0 16px;color:#18181b;font-size:20px">Schicht-Erinnerung</h1>
      <p style="margin:0 0 12px;color:#333;line-height:1.55">Hallo ${escapeHtml(emp.name)},</p>
      <p style="margin:0 0 12px;color:#333;line-height:1.55">heute (${escapeHtml(dateLabel)}) hast du eine Schicht:</p>
      <table cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:separate;border-spacing:0 6px">
        <tr>
          <td style="padding-right:16px;color:#71717a;font-size:13px">Beginn</td>
          <td style="color:#18181b;font-weight:600;font-size:15px">${escapeHtml(start)}</td>
        </tr>
        <tr>
          <td style="padding-right:16px;color:#71717a;font-size:13px">Ende</td>
          <td style="color:#18181b;font-weight:600;font-size:15px">${escapeHtml(end)}</td>
        </tr>
        ${
          shift.break_minutes && Number(shift.break_minutes) > 0
            ? `<tr><td style="padding-right:16px;color:#71717a;font-size:13px">Pause</td><td style="color:#18181b;font-size:14px">${escapeHtml(String(shift.break_minutes))} min</td></tr>`
            : ""
        }
        ${
          shift.comment
            ? `<tr><td style="padding-right:16px;color:#71717a;font-size:13px;vertical-align:top">Notiz</td><td style="color:#18181b;font-size:14px">${escapeHtml(shift.comment)}</td></tr>`
            : ""
        }
      </table>
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "")}/tools/dienstplaner" style="background:#0284c7;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Zum Dienstplaner</a>
      </p>
      <p style="margin:24px 0 0;color:#a1a1aa;font-size:11px">Du erhältst diese E-Mail, weil du als Mitarbeiter im ${escapeHtml(APP_NAME)}-Dienstplan verknüpft bist.</p>
    </td></tr>
  </table>
</body></html>`;

      try {
        await notify({
          userId: emp.user_id,
          kind: "shift_reminder",
          title,
          body,
          link: "/tools/dienstplaner",
          emailHtml,
          emailText: `${title}\n\n${body}\n\nZum Dienstplaner: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tools/dienstplaner`,
        });
        notified += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`employee=${emp.id}: ${message}`);
      }
    }

    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: errors.length === 0,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: {
        date: today,
        shifts: todaysShifts.length,
        notified,
        skippedNoLink,
        errors: errors.length ? errors : null,
      },
    });

    return NextResponse.json({
      ok: errors.length === 0,
      date: today,
      shifts: todaysShifts.length,
      notified,
      skippedNoLink,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "shift_reminder_failed",
    });
    reportError(error, { cron: JOB_NAME });
    return NextResponse.json({ ok: false, error: "shift_reminder_failed" }, { status: 500 });
  }
}
