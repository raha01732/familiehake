// /workspace/familiehake/src/app/api/cron/cache-warmup/route.ts
import { logCronRun } from "@/lib/cron-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getStorageUsageSummary, getJournalSummary } from "@/lib/stats";
import { reportError } from "@/lib/sentry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: "cache-warmup",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "unauthorized",
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const [storage, journal] = await Promise.all([
      getStorageUsageSummary(),
      getJournalSummary(),
    ]);

    await logCronRun({
      jobName: "cache-warmup",
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: {
        totalFiles: storage.totalFiles,
        totalEntries: journal.totalEntries,
      },
    });

    return NextResponse.json({
      ok: true,
      warmedAt: new Date().toISOString(),
      storageTotals: {
        totalFiles: storage.totalFiles,
        totalBytes: storage.totalBytes,
      },
      journalTotals: {
        totalEntries: journal.totalEntries,
      },
    });
  } catch (error) {
    await logCronRun({
      jobName: "cache-warmup",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "cache_warmup_failed",
    });
    reportError(error, { cron: "cache-warmup" });
    return NextResponse.json({ ok: false, error: "cache_warmup_failed" }, { status: 500 });
  }
}
