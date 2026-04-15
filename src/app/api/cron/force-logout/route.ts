// /workspace/familiehake/src/app/api/cron/force-logout/route.ts
import * as Sentry from "@sentry/nextjs";
import { clerkClient } from "@clerk/nextjs/server";
import { claimDailyCronRun, logCronRun } from "@/lib/cron-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getRedisClient } from "@/lib/redis";
import { reportError } from "@/lib/sentry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_KEY = "ops:heartbeat:force-logout";
const HEARTBEAT_TTL_SECONDS = 60 * 60 * 48;
const CLERK_PAGE_SIZE = 100;

function parseIdleTimeoutHours() {
  const raw = process.env.FORCE_LOGOUT_IDLE_TIMEOUT_HOURS;
  if (!raw) return 24;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }

  return Math.floor(parsed);
}

const IDLE_TIMEOUT_HOURS = parseIdleTimeoutHours();

type ClerkSession = {
  id: string;
  status?: string | null;
  last_active_at?: number | string | null;
  lastActiveAt?: number | string | null;
  updated_at?: number | string | null;
  updatedAt?: number | string | null;
};

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value <= 0) return null;
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsedNumeric = Number(value);
    if (Number.isFinite(parsedNumeric)) {
      if (parsedNumeric <= 0) return null;
      return parsedNumeric > 1e12 ? parsedNumeric : parsedNumeric * 1000;
    }
    const parsedDate = Date.parse(value);
    return Number.isFinite(parsedDate) ? parsedDate : null;
  }
  return null;
}

function getLastActiveAt(session: ClerkSession) {
  return (
    normalizeTimestamp(session.last_active_at) ??
    normalizeTimestamp(session.lastActiveAt) ??
    normalizeTimestamp(session.updated_at) ??
    normalizeTimestamp(session.updatedAt)
  );
}

function shouldRevokeSessionByIdlePolicy(session: ClerkSession, nowMs: number) {
  const lastActiveAt = getLastActiveAt(session);
  if (lastActiveAt == null) return true;
  const idleMs = nowMs - lastActiveAt;
  const idleTimeoutMs = Math.max(1, IDLE_TIMEOUT_HOURS) * 60 * 60 * 1000;
  return idleMs >= idleTimeoutMs;
}

async function listActiveSessions(): Promise<ClerkSession[]> {
  const client = await clerkClient();
  const sessions: ClerkSession[] = [];
  let offset = 0;

  while (true) {
    const page = (await client.sessions.getSessionList({
      limit: CLERK_PAGE_SIZE,
      offset,
    })) as unknown as {
      data?: ClerkSession[];
      totalCount?: number;
    };

    const data = Array.isArray(page.data) ? page.data : [];
    if (data.length === 0) break;

    // Clerk v6: status filter not supported in getSessionList — filter client-side
    const activePage = data.filter((s) => !s.status || s.status === "active");
    sessions.push(...activePage);

    const totalCount = typeof page.totalCount === "number" ? page.totalCount : 0;
    offset += data.length;
    if (offset >= totalCount || data.length < CLERK_PAGE_SIZE) break;
  }

  return sessions;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  if (!isAuthorizedCronRequest(req)) {
    await logCronRun({
      jobName: "force-logout",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "unauthorized",
    });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const claimResult = await claimDailyCronRun("force-logout");
  if (!claimResult.ok) {
    await logCronRun({
      jobName: "force-logout",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: claimResult.errorMessage,
      details: {
        reason: "claim_failed",
        errorCode: claimResult.errorCode,
      },
    });
    return NextResponse.json({ ok: false, error: "claim_daily_run_failed" }, { status: 503 });
  }

  if (!claimResult.claimed) {
    await logCronRun({
      jobName: "force-logout",
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
    const client = await clerkClient();
    const activeSessions = await listActiveSessions();
    const nowMs = Date.now();
    const targets = activeSessions.filter((session) => shouldRevokeSessionByIdlePolicy(session, nowMs));

    let revoked = 0;
    let revokeErrors = 0;

    for (const session of targets) {
      try {
        await client.sessions.revokeSession(session.id);
        revoked += 1;
      } catch (error) {
        revokeErrors += 1;
        Sentry.captureException(error, {
          tags: {
            cron: "force-logout",
            stage: "revoke-session",
          },
          extra: {
            sessionId: session.id,
          },
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;

    const redis = getRedisClient();
    if (redis) {
      await redis.set(
        HEARTBEAT_KEY,
        {
          finishedAt,
          ok: revokeErrors === 0,
          activeSessions: activeSessions.length,
          targetedSessions: targets.length,
          revoked,
          revokeErrors,
          durationMs,
        },
        { ex: HEARTBEAT_TTL_SECONDS }
      );
    }

    await logCronRun({
      jobName: "force-logout",
      request: req,
      success: revokeErrors === 0,
      startedAt,
      durationMs,
      details: {
        activeSessions: activeSessions.length,
        targetedSessions: targets.length,
        revoked,
        revokeErrors,
        idleTimeoutHours: Math.max(1, IDLE_TIMEOUT_HOURS),
      },
    });

    return NextResponse.json({
      ok: revokeErrors === 0,
      activeSessions: activeSessions.length,
      targetedSessions: targets.length,
      revoked,
      revokeErrors,
      durationMs,
    });
  } catch (error) {
    await logCronRun({
      jobName: "force-logout",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "force_logout_failed",
    });
    reportError(error, { cron: "force-logout" });
    return NextResponse.json({ ok: false, error: "force_logout_failed" }, { status: 500 });
  }
}
