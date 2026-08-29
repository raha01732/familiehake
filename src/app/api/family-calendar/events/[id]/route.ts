// src/app/api/family-calendar/events/[id]/route.ts
// Bearbeiten (PUT) und Loeschen (DELETE) eines geteilten Familientermins.
// Voll geteilt: jeder Termin ist fuer jeden mit Zugriff bearbeitbar, keine
// Eigentuemerschaftspruefung (wie tools/tasks).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 300;
const MAX_LOCATION = 300;
const MAX_DESCRIPTION = 5_000;

type RouteContext = { params: Promise<{ id: string }> };

function isValidIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:family-calendar:events:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

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

  const location = typeof body.location === "string" ? body.location.slice(0, MAX_LOCATION) : null;
  const description =
    typeof body.description === "string" ? body.description.slice(0, MAX_DESCRIPTION) : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("family_calendar_events")
    .update({
      title,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      location: location || null,
      description: description || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,title,starts_at,ends_at,location,description,created_by")
    .maybeSingle();

  if (error) {
    console.error("family-calendar events PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:family-calendar:events:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const sb = createAdminClient();
  const { error } = await sb.from("family_calendar_events").delete().eq("id", id);

  if (error) {
    console.error("family-calendar events DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
