/**src/app/api/upload/route.ts**/

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(name: string) {
  // sehr defensiv: keine Pfadtrenner, kontrollierte Länge
  const base = name.replace(/[/\\]/g, "_").replace(/\s+/g, " ").trim();
  return base.slice(0, 180) || "file";
}

function ymd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return { y, m, d };
}

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) {
    // Wenn der Upload über ein <form> ohne JS kommt, ist ein Redirect UX-freundlicher
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as unknown as File | null;
    const folderIdRaw = form.get("folderId");
    const folderId =
      typeof folderIdRaw === "string" && folderIdRaw.trim().length > 0
        ? folderIdRaw.trim()
        : null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
    }

    const fileName = safeFileName(file.name || "upload.bin");
    const contentType = file.type || "application/octet-stream";
    const size = typeof (file as any).size === "number" ? (file as any).size : undefined;

    // Speicherpfad konstruieren (eindeutig, gruppiert)
    const { y, m, d } = ymd();
    const rand = Math.random().toString(36).slice(2, 10);
    const ts = Date.now();
    const storagePath = `${userId}/${y}/${m}/${d}/${ts}_${rand}_${fileName}`;

    const sb = createAdminClient();

    // In Storage hochladen
    // Supabase akzeptiert File/Blob/ArrayBuffer in Node.js (supabase-js v2)
    const { error: upErr } = await sb.storage
      .from("files")
      .upload(storagePath, file, {
        contentType,
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // Metadaten in DB schreiben
    const { error: dbErr } = await sb.from("files_meta").insert({
      user_id: userId,
      storage_path: storagePath,
      file_name: fileName,
      file_size: size ?? null,
      mime_type: contentType || null,
      folder_id: folderId,       // <- Ordnerbezug
      deleted_at: null,
    });

    if (dbErr) {
      // Aufräumen, falls DB-Fail (Best-effort)
      await sb.storage.from("files").remove([storagePath]).catch(() => {});
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    // Audit (bestehenden Action-Typ nutzen, damit dein Union nicht bricht)
    try {
      await logAudit({
        action: "login_success",
        actorUserId: userId,
        actorEmail: null,
        target: storagePath,
        detail: {
          event: "file_upload",
          file_name: fileName,
          content_type: contentType,
          size,
          folder_id: folderId,
        },
      });
    } catch {
      // Audit-Fehler nicht fatal
    }

    // UX: zurück zur Dateiansicht (inkl. aktuellem Ordner)
    const to = new URL("/tools/files", req.url);
    if (folderId) to.searchParams.set("folder", folderId);
    return NextResponse.redirect(to, 302);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "upload_failed" }, { status: 500 });
  }
}
