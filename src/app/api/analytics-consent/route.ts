// src/app/api/analytics-consent/route.ts
// Geräteübergreifende Analytics-Einwilligung (PostHog / Sentry Session
// Replay), gespiegelt aus dem lokalen Browser-Cookie. Siehe
// AnalyticsConsentBanner / AnalyticsConsentSettings.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Consent = "granted" | "denied";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:analytics-consent:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data } = await sb
    .from("user_analytics_consent")
    .select("consent")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ ok: true, data: { consent: (data?.consent as Consent | undefined) ?? null } });
}

export async function PATCH(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:analytics-consent:patch");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (body.consent !== "granted" && body.consent !== "denied") {
    return NextResponse.json({ ok: false, error: "consent must be 'granted' or 'denied'" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb.from("user_analytics_consent").upsert(
    { user_id: userId, consent: body.consent, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("analytics-consent PATCH error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { consent: body.consent } });
}
