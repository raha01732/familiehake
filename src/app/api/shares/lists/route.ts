// /workspace/familiehake/src/app/api/shares/lists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionInfo } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { isSuperAdmin } = await getSessionInfo();
  const sb = createAdminClient();

  const fileId = req.nextUrl.searchParams.get("fileId");

  let query = sb
    .from("file_shares")
    .select("id, token, file_id, owner_user_id, expires_at, max_downloads, downloads_count, revoked_at, created_at");

  if (fileId) {
    query = query.eq("file_id", fileId);
  }

  if (!isSuperAdmin) {
    query = query.eq("owner_user_id", userId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data });
}
