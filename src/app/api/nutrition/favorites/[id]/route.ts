// src/app/api/nutrition/favorites/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await applyRateLimit(req, "api:nutrition:fav:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("nutrition_favorites")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("nutrition favorites DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "nutrition_favorite_delete",
    actorUserId: userId,
    actorEmail: null,
    target: `nutrition_favorites:${id}`,
    detail: null,
  });

  return NextResponse.json({ ok: true });
}
