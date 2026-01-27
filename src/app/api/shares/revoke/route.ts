// /workspace/familiehake/src/app/api/shares/revoke/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // @ts-ignore NextRequest kompatibel: Runtime liefert kompatibles Objekt
  const rl = await applyRateLimit(req as any, "api:shares:revoke");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { isSuperAdmin } = await getSessionInfo();
  const sb = createAdminClient();

  const { shareId } = (await req.json().catch(() => ({}))) as { shareId?: string };
  if (!shareId) return NextResponse.json({ ok: false, error: "missing shareId" }, { status: 400 });

  const { data: share } = await sb
    .from("file_shares")
    .select("id, owner_user_id, file_id, revoked_at")
    .eq("id", shareId)
    .single();

  if (!share) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (!isSuperAdmin && share.owner_user_id !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (share.revoked_at) return NextResponse.json({ ok: true, already: true });

  const { error } = await sb.from("file_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await logAudit({
    action: "file_share_revoke",
    actorUserId: userId,
    actorEmail: null,
    target: share.file_id,
    detail: { share_id: shareId },
  });

  return NextResponse.json({ ok: true });
}
