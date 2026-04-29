// src/app/api/journal/entries/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 300;
const MAX_CONTENT = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await applyRateLimit(req, "api:journal:entries:patch");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  let body: { title?: string; content_md?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, MAX_TITLE);
  if (typeof body.content_md === "string") patch.content_md = body.content_md.slice(0, MAX_CONTENT);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no fields" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("journal_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id,title,content_md,created_at,updated_at")
    .single();

  if (error) {
    console.error("journal entries PATCH error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await applyRateLimit(req, "api:journal:entries:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("journal entries DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
