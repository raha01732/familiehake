/** src/app/api/shares/create/route.ts */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { generateShareToken, hashPasswordScrypt } from "@/lib/share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => null);
  if (!data)
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });

  const { fileId, expiresInMinutes, password, maxDownloads } = data;

  const sb = createAdminClient();

  // Ownership prüfen
  const { data: file } = await sb
    .from("files_meta")
    .select("id, user_id, file_name")
    .eq("id", fileId)
    .single();

  if (!file || file.user_id !== userId)
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const token = generateShareToken();
  const expires_at =
    expiresInMinutes && Number.isFinite(expiresInMinutes)
      ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
      : null;

  let password_algo: string | null = null;
  let password_salt: string | null = null;
  let password_hash: string | null = null;

  if (password) {
    const h = await hashPasswordScrypt(password);
    password_algo = h.algo;
    password_salt = h.salt;
    password_hash = h.hash;
  }

  const { error } = await sb.from("file_shares").insert({
    token,
    file_id: file.id,
    owner_user_id: userId,
    password_algo,
    password_salt,
    password_hash,
    expires_at,
    max_downloads: maxDownloads ?? null,
  });

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await logAudit({
    action: "file_share_create",
    actorUserId: userId,
    actorEmail: null,
    target: file.id,
    detail: {
      token_suffix: token.slice(-6),
      file: file.file_name,
      expires_at,
      maxDownloads: maxDownloads ?? null,
    },
  });

  return NextResponse.json({ ok: true, token });
}
