// src/app/api/cron/dispatch-system-messages/route.ts
// Versendet fällige, zeitgesteuerte Systemnachrichten.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logCronRun } from "@/lib/cron-jobs";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchSystemMessage } from "@/lib/system-messages/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAME = "dispatch-system-messages";
const BATCH_LIMIT = 25;

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
    const nowIso = new Date().toISOString();

    const { data: due, error } = await sb
      .from("system_messages")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) throw error;

    const ids = (due ?? []).map((r) => (r as { id: string }).id);
    let sent = 0;
    let failed = 0;
    for (const id of ids) {
      const result = await dispatchSystemMessage(id);
      if (result.ok) sent += 1;
      else failed += 1;
    }

    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { due: ids.length, sent, failed },
    });

    return NextResponse.json({ ok: true, due: ids.length, sent, failed });
  } catch (error) {
    await logCronRun({
      jobName: JOB_NAME,
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "dispatch_system_messages_failed",
    });
    reportError(error, { cron: JOB_NAME });
    return NextResponse.json({ ok: false, error: "dispatch_system_messages_failed" }, { status: 500 });
  }
}
