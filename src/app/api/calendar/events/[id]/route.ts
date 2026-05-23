// src/app/api/calendar/events/[id]/route.ts
// Bearbeiten (PUT) und Löschen (DELETE) eines eigenen Kalendertermins.
// Inhalte werden wie beim Anlegen pro Nutzer AES-verschlüsselt.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptCalendar, decryptCalendar } from "@/lib/calendar-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 300;
const MAX_LOCATION = 300;
const MAX_DESCRIPTION = 5_000;

type RouteContext = { params: Promise<{ id: string }> };

type StoredRow = {
  id: string;
  title_enc: string;
  starts_at: string;
  ends_at: string;
  location_enc: string | null;
  description_enc: string | null;
};

function isValidIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
}

function decryptRow(row: StoredRow, userId: string) {
  return {
    id: row.id,
    title: decryptCalendar(row.title_enc, userId),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    location: row.location_enc ? decryptCalendar(row.location_enc, userId) : null,
    description: row.description_enc ? decryptCalendar(row.description_enc, userId) : null,
  };
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:calendar:events:put");
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

  const locationPlain =
    typeof body.location === "string" ? body.location.slice(0, MAX_LOCATION) : null;
  const descriptionPlain =
    typeof body.description === "string" ? body.description.slice(0, MAX_DESCRIPTION) : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_events")
    .update({
      title_enc: encryptCalendar(title, userId),
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      location_enc: locationPlain ? encryptCalendar(locationPlain, userId) : null,
      description_enc: descriptionPlain ? encryptCalendar(descriptionPlain, userId) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id,title_enc,starts_at,ends_at,location_enc,description_enc")
    .maybeSingle();

  if (error) {
    console.error("calendar events PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: decryptRow(data as StoredRow, userId) });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:calendar:events:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const sb = createAdminClient();
  const { error } = await sb
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("calendar events DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
