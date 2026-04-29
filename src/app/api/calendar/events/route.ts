// src/app/api/calendar/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 300;
const MAX_LOCATION = 300;
const MAX_DESCRIPTION = 5_000;

function isValidIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:events:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_events")
    .select("id,title,starts_at,ends_at,location,description")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("calendar events GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:events:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    title?: string;
    starts_at?: string;
    ends_at?: string;
    location?: string | null;
    description?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.slice(0, MAX_TITLE).trim() : "";
  if (!title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });

  if (!isValidIso(body.starts_at) || !isValidIso(body.ends_at)) {
    return NextResponse.json({ ok: false, error: "invalid dates" }, { status: 400 });
  }
  if (Date.parse(body.ends_at) < Date.parse(body.starts_at)) {
    return NextResponse.json({ ok: false, error: "ends_at before starts_at" }, { status: 400 });
  }

  const location =
    typeof body.location === "string" ? body.location.slice(0, MAX_LOCATION) : null;
  const description =
    typeof body.description === "string" ? body.description.slice(0, MAX_DESCRIPTION) : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_events")
    .insert({
      user_id: userId,
      title,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      location,
      description,
    })
    .select("id,title,starts_at,ends_at,location,description")
    .single();

  if (error) {
    console.error("calendar events POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
