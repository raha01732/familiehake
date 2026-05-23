// src/app/api/calendar/feeds/route.ts
// Abonnierte externe Kalender-Feeds auflisten (GET) und hinzufügen (POST).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptCalendar, decryptCalendar } from "@/lib/calendar-crypto";
import { normalizeFeedColor, normalizeFeedUrl } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FEEDS = 30;
const MAX_NAME = 120;

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

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:feeds:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_feeds")
    .select("id,name,url_enc,color,enabled,last_synced_at,last_error")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("calendar feeds GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: (data ?? []).map((r) => present(r as FeedRow, userId)) });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:feeds:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { name?: string; url?: string; color?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.slice(0, MAX_NAME).trim() : "";
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const url = typeof body.url === "string" ? normalizeFeedUrl(body.url) : null;
  if (!url) return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });

  const sb = createAdminClient();

  const { count } = await sb
    .from("calendar_feeds")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= MAX_FEEDS) {
    return NextResponse.json({ ok: false, error: "too many feeds" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("calendar_feeds")
    .insert({
      user_id: userId,
      name,
      url_enc: encryptCalendar(url, userId),
      color: normalizeFeedColor(body.color),
      enabled: body.enabled === false ? false : true,
    })
    .select("id,name,url_enc,color,enabled,last_synced_at,last_error")
    .single();

  if (error) {
    console.error("calendar feeds POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: present(data as FeedRow, userId) });
}
