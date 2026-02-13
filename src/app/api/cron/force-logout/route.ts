// /workspace/familiehake/src/app/api/cron/force-logout/route.ts
import * as Sentry from "@sentry/nextjs";
import { clerkClient } from "@clerk/nextjs/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getRedisClient } from "@/lib/redis";
import { reportError } from "@/lib/sentry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_KEY = "ops:heartbeat:force-logout";
const HEARTBEAT_TTL_SECONDS = 60 * 60 * 48;
const CLERK_PAGE_SIZE = 100;

type ClerkSession = {
  id: string;
};

function shouldRevokeSession() {
  // Policy: täglicher harter Logout (alle aktiven Sessions werden widerrufen).
  return true;
}

async function listActiveSessions(): Promise<ClerkSession[]> {
  const client = await clerkClient();
  const sessions: ClerkSession[] = [];
  let offset = 0;

  while (true) {
    const page = (await client.sessions.getSessionList({
      status: "active",
      limit: CLERK_PAGE_SIZE,
      offset,
    })) as unknown as {
      data?: ClerkSession[];
      totalCount?: number;
    };

    const data = Array.isArray(page.data) ? page.data : [];
    if (data.length === 0) break;

    sessions.push(...data);

    const totalCount = typeof page.totalCount === "number" ? page.totalCount : 0;
    offset += data.length;
    if (offset >= totalCount || data.length < CLERK_PAGE_SIZE) break;
  }

  return sessions;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const client = await clerkClient();
    const activeSessions = await listActiveSessions();
    const targets = activeSessions.filter(shouldRevokeSession);

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

    return NextResponse.json({
      ok: revokeErrors === 0,
      activeSessions: activeSessions.length,
      targetedSessions: targets.length,
      revoked,
      revokeErrors,
      durationMs,
    });
  } catch (error) {
    reportError(error, { cron: "force-logout" });
    return NextResponse.json({ ok: false, error: "force_logout_failed" }, { status: 500 });
  }
}
