import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ ok: false, error: "missing path" }, { status: 400 });

  // Ownership prüfen
  const sb = createAdminClient();
  const { data: row } = await sb.from("files_meta").select("user_id").eq("storage_path", path).single();
  if (!row || row.user_id !== userId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data, error } = await sb.storage.from("files").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ ok: false, error: error?.message || "signed url failed" }, { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
