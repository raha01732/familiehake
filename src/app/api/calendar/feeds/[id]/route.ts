// src/app/api/calendar/feeds/[id]/route.ts
// Externen Kalender-Feed bearbeiten (PUT) und entfernen (DELETE).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptCalendar, decryptCalendar } from "@/lib/calendar-crypto";
import { normalizeFeedColor, normalizeFeedUrl } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_NAME = 120;

type RouteContext = { params: Promise<{ id: string }> };

type FeedRow = {
  id: string;
  name: string;
  url_enc: string;
  color: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

function present(row: FeedRow, userId: string) {
  let url = "";
  try {
    url = decryptCalendar(row.url_enc, userId);
  } catch {
    url = "";
  }
  return {
    id: row.id,
    name: row.name,
    url,
    color: row.color,
    enabled: row.enabled,
    last_synced_at: row.last_synced_at,
    last_error: row.last_error,
  };
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:calendar:feeds:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  let body: { name?: string; url?: string; color?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") {
    const name = body.name.slice(0, MAX_NAME).trim();
    if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    update.name = name;
  }
  if (typeof body.url === "string") {
    const url = normalizeFeedUrl(body.url);
    if (!url) return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
    update.url_enc = encryptCalendar(url, userId);
    // URL geändert → vorherigen Fehlerstatus zurücksetzen.
    update.last_error = null;
  }
  if (typeof body.color !== "undefined") update.color = normalizeFeedColor(body.color);
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_feeds")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id,name,url_enc,color,enabled,last_synced_at,last_error")
    .maybeSingle();

  if (error) {
    console.error("calendar feeds PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, data: present(data as FeedRow, userId) });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:calendar:feeds:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const sb = createAdminClient();
  const { error } = await sb.from("calendar_feeds").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    console.error("calendar feeds DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
