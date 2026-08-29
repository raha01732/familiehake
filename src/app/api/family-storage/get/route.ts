// src/app/api/family-storage/get/route.ts
// Download aus dem geteilten Familien-Storage. Anders als beim
// persoenlichen Pendant (/api/files/get) KEINE Eigentuemerschaftspruefung -
// jeder Angemeldete darf jede Datei im gemeinsamen Bereich herunterladen.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:family-storage:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ ok: false, error: "missing path" }, { status: 400 });
  if (!path.startsWith("family/")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = createAdminClient();
  const { data: row } = await sb
    .from("family_files_meta")
    .select("id")
    .eq("storage_path", path)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const { data, error } = await sb.storage.from("files").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message || "signed url failed" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
