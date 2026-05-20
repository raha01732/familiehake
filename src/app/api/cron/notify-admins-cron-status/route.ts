// src/app/api/cron/notify-admins-cron-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { reportError } from "@/lib/sentry";
import { sendEmail, resolveUserEmail } from "@/lib/mail";
import {
  buildCronStatusReport,
  listAdminUserIds,
  WINDOW_HOURS,
} from "@/lib/cron-status-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const report = await buildCronStatusReport();
    const adminIds = await listAdminUserIds();

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
        subject: report.subject,
        html: report.html,
        text: report.text,
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
        jobs_observed: report.jobsObserved,
        has_failures: report.hasFailures,
        audit_events: report.auditEventCount,
        admin_count: adminIds.length,
        recipients: emails.length,
        mail_skipped: Boolean(mailResult.skipped),
        mail_ok: mailResult.ok,
      },
    });

    return NextResponse.json({
      ok: true,
      jobs: report.jobsObserved,
      audit_events: report.auditEventCount,
      recipients: emails.length,
      has_failures: report.hasFailures,
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
