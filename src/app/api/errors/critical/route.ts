// /workspace/familiehake/src/app/api/errors/critical/route.ts
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { applyRateLimit } from "@/lib/ratelimit";

type CriticalErrorPayload = {
  message?: string;
  stack?: string | null;
  source?: string | null;
  severity?: string | null;
  url?: string | null;
  timestamp?: string | null;
  userAgent?: string | null;
};

export async function POST(req: NextRequest) {
  const rateLimit = await applyRateLimit(req, "critical-errors");
  if (rateLimit instanceof NextResponse) {
    return rateLimit;
  }

  let payload: CriticalErrorPayload = {};
  try {
    payload = (await req.json()) as CriticalErrorPayload;
  } catch {
    payload = {};
  }

  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const session = clerkEnabled ? await getSessionInfo() : null;
  const errorMessage = payload.message ?? "Unknown critical error";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  Sentry.captureException(new Error(errorMessage));

  if (supabaseConfigured) {
    await logAudit({
      action: "critical_error",
      actorUserId: session?.signedIn ? session.userId : null,
      actorEmail: session?.signedIn ? session.email : null,
      target: payload.url ?? null,
      detail: {
        message: payload.message ?? null,
        stack: payload.stack ?? null,
        source: payload.source ?? null,
        severity: payload.severity ?? null,
        timestamp: payload.timestamp ?? null,
        userAgent: payload.userAgent ?? null,
      },
    });
  } else {
    console.warn("critical_error audit skipped: Supabase env missing");
  }

  return NextResponse.json({ ok: true });
}
