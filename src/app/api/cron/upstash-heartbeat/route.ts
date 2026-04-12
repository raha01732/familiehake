// /workspace/familiehake/src/app/api/cron/upstash-heartbeat/route.ts
import { logCronRun } from "@/lib/cron-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getRedisClient } from "@/lib/redis";
import { reportError } from "@/lib/sentry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_KEY = "ops:heartbeat:upstash";
const HEARTBEAT_TTL_SECONDS = 60 * 60 * 48;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: "upstash-heartbeat",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "unauthorized",
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const redis = getRedisClient();
  if (!redis) {
    await logCronRun({
      jobName: "upstash-heartbeat",
      request: req,
      success: false,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "upstash_not_configured",
    });
    return NextResponse.json({ ok: false, skipped: true, error: "upstash_not_configured" });
  }

  const pingedAt = new Date().toISOString();

  try {
    await redis.set(HEARTBEAT_KEY, pingedAt, { ex: HEARTBEAT_TTL_SECONDS });
    await logCronRun({
      jobName: "upstash-heartbeat",
      request: req,
      success: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      details: { key: HEARTBEAT_KEY, pingedAt },
    });
    return NextResponse.json({ ok: true, key: HEARTBEAT_KEY, pingedAt });
  } catch (error) {
    await logCronRun({
      jobName: "upstash-heartbeat",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "upstash_heartbeat_failed",
    });
    reportError(error, { cron: "upstash-heartbeat" });
    return NextResponse.json({ ok: false, error: "upstash_heartbeat_failed" }, { status: 500 });
  }
}
