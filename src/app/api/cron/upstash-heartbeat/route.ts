// /workspace/familiehake/src/app/api/cron/upstash-heartbeat/route.ts
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getRedisClient } from "@/lib/redis";
import { reportError } from "@/lib/sentry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_KEY = "ops:heartbeat:upstash";
const HEARTBEAT_TTL_SECONDS = 60 * 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json({ ok: false, skipped: true, error: "upstash_not_configured" });
  }

  const pingedAt = new Date().toISOString();

  try {
    await redis.set(HEARTBEAT_KEY, pingedAt, { ex: HEARTBEAT_TTL_SECONDS });
    return NextResponse.json({ ok: true, key: HEARTBEAT_KEY, pingedAt });
  } catch (error) {
    reportError(error, { cron: "upstash-heartbeat" });
    return NextResponse.json({ ok: false, error: "upstash_heartbeat_failed" }, { status: 500 });
  }
}
