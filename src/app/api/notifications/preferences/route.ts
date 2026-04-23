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
    .select("email_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: { email_enabled: data?.email_enabled !== false },
  });
}

export async function PATCH(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:notifications:prefs:patch");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { email_enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (typeof body.email_enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "email_enabled required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        email_enabled: body.email_enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("notifications prefs PATCH error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { email_enabled: body.email_enabled } });
}
