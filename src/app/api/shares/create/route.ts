import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateShareToken, hashPasswordScrypt } from "@/lib/share";
import { logAudit } from "@/lib/audit";
import { getSessionInfo } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { role } = await getSessionInfo(); // falls du später Admin-only-Regeln willst
  const body = await req.json().catch(() => ({}));
  const { fileId, expiresInMinutes, password, maxDownloads } = body as {
    fileId: string;
    expiresInMinutes?: number;
    password?: string;
    maxDownloads?: number;
  };
  if (!fileId) return NextResponse.json({ ok: false, error: "missing fileId" }, { status: 400 });

  const sb = createAdminClient();

  // Ownership prüfen
  const { data: file } = await sb
    .from("files_meta")
    .select("id, user_id, storage_path, file_name, file_size, mime_type, created_at")
    .eq("id", fileId)
    .single();

  if (!file || file.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const token = generateShareToken();
  const expires_at =
    expiresInMinutes && expiresInMinutes > 0
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

  let password_algo: string | null = null;
  let password_salt: string | null = null;
  let password_hash: string | null = null;

  if (password && password.trim().length > 0) {
    const h = await hashPasswordScrypt(password.trim());
    password_algo = h.algo;
    password_salt = h.salt;
    password_hash = h.hash;
  }

  const { error, data } = await sb
    .from("file_shares")
    .insert({
      token,
      file_id: file.id,
      owner_user_id: userId,
      password_algo,
      password_salt,
      password_hash,
      expires_at,
      max_downloads: maxDownloads ?? null,
    })
    .select("id, token, expires_at, max_downloads")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logAudit({
    action: "file_share_create",
    actorUserId: userId,
    actorEmail: null,
    target: file.id,
    detail: { share_id: data.id, token_suffix: token.slice(-6), expires_at, maxDownloads: maxDownloads ?? null },
  });

  // Public-URL zum Teilen
  const origin = new URL(req.url).origin;
  const shareUrl = `${origin}/s/${data.token}`;

  return NextResponse.json({ ok: true, id: data.id, token: data.token, shareUrl, expires_at: data.expires_at, max_downloads: data.max_downloads });
}
