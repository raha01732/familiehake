// src/app/api/theme/set/route.ts
// Lightweight theme-persistence endpoint — no revalidatePath, no page reload.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setCachedJson } from "@/lib/redis";
import { getThemePresets } from "@/lib/theme";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:theme:set");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let presetId: string;
  try {
    const body = await req.json();
    presetId = String(body.presetId ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const presets = await getThemePresets();
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) {
    return NextResponse.json({ ok: false, error: "unknown preset" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb.from("user_theme_preferences").upsert(
    { user_id: userId, preset_id: presetId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await setCachedJson(`theme:user:${userId}`, preset, 60 * 60 * 12);

  return NextResponse.json({ ok: true, preset });
}
