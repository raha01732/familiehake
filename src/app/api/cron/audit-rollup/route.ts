// /workspace/familiehake/src/app/api/cron/audit-rollup/route.ts
import { logCronRun } from "@/lib/cron-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getRedisClient } from "@/lib/redis";
import { reportError } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AuditEventRow = {
  action: string;
};

const METRICS_PREFIX = "metrics:audit";
const METRICS_TTL_SECONDS = 60 * 60 * 24 * 14;

function buildHourBucket(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}`;
}

function countByAction(rows: AuditEventRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const current = acc[row.action] ?? 0;
    acc[row.action] = current + 1;
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({ jobName: "audit-rollup", request: req, success: false, errorMessage: "unauthorized" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const redis = getRedisClient();
  if (!redis) {
    await logCronRun({
      jobName: "audit-rollup",
      request: req,
      success: false,
      skipped: true,
      durationMs: Date.now() - startedAt,
      errorMessage: "upstash_not_configured",
    });
    return NextResponse.json({ ok: false, skipped: true, error: "upstash_not_configured" });
  }

  try {
    const sb = createAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const hourBucket = buildHourBucket(now);

    const { data, error } = await sb
      .from("audit_events")
      .select("action")
      .gte("ts", windowStart)
      .order("ts", { ascending: true })
      .limit(5000);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as AuditEventRow[];
    const grouped = countByAction(rows);
    const writes: Array<Promise<unknown>> = Object.entries(grouped).map(([action, count]) => {
      const key = `${METRICS_PREFIX}:${action}:${hourBucket}`;
      return redis.set(key, count, { ex: METRICS_TTL_SECONDS });
    });

    writes.push(
      redis.set(`${METRICS_PREFIX}:last-run`, now.toISOString(), {
        ex: METRICS_TTL_SECONDS,
      })
    );

    await Promise.all(writes);

    await logCronRun({
      jobName: "audit-rollup",
      request: req,
      success: true,
      durationMs: Date.now() - startedAt,
      details: {
        hourBucket,
        actions: Object.keys(grouped).length,
        rows: rows.length,
      },
    });

    return NextResponse.json({
      ok: true,
      hourBucket,
      actions: Object.keys(grouped).length,
      rows: rows.length,
    });
  } catch (error) {
    await logCronRun({
      jobName: "audit-rollup",
      request: req,
      success: false,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "audit_rollup_failed",
    });
    reportError(error, { cron: "audit-rollup" });
    return NextResponse.json({ ok: false, error: "audit_rollup_failed" }, { status: 500 });
  }
}
