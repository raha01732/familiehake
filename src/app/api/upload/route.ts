import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "no file" }, { status: 400 });

  const sb = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await sb.storage.from("files").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const { error: metaErr } = await sb.from("files_meta").insert({
    user_id: userId,
    storage_path: path,
    file_name: file.name,
    file_size: buf.byteLength,
    mime_type: file.type || null,
  });
  if (metaErr) return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 });

  await logAudit({
    action: "file_upload",
    actorUserId: userId,
    actorEmail: null,
    target: path,
    detail: { file: file.name, size: buf.byteLength },
  });

  return NextResponse.json({ ok: true, path });
}
