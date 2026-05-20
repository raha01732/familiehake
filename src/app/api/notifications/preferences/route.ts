// src/app/api/notifications/preferences/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:notifications:prefs:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data } = await sb
    .from("notification_preferences")
    .select("email_enabled, open_tracking_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: {
      email_enabled: data?.email_enabled !== false,
      open_tracking_enabled: data?.open_tracking_enabled !== false,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:notifications:prefs:patch");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { email_enabled?: unknown; open_tracking_enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  const echo: Record<string, boolean> = {};
  if (typeof body.email_enabled === "boolean") {
    updates.email_enabled = body.email_enabled;
    echo.email_enabled = body.email_enabled;
  }
  if (typeof body.open_tracking_enabled === "boolean") {
    updates.open_tracking_enabled = body.open_tracking_enabled;
    echo.open_tracking_enabled = body.open_tracking_enabled;
  }

  if (Object.keys(echo).length === 0) {
    return NextResponse.json(
      { ok: false, error: "email_enabled or open_tracking_enabled required" },
      { status: 400 }
    );
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("notification_preferences")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("notifications prefs PATCH error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: echo });
}
