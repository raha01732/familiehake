import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { generateShareToken, hashPasswordScrypt } from "@/lib/share";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Rate-Limit (optional; bei fehlender Upstash-Config no-op)
    // @ts-ignore NextRequest kompatibel: Runtime liefert kompatibles Objekt
    const rl = await applyRateLimit(req as any, "api:shares:create");
    // Wenn applyRateLimit eine NextResponse (429) zurückgegeben hat:
    if (rl instanceof NextResponse) return rl;

    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      fileId,
      expiresInMinutes,
      password,
      maxDownloads,
    } = (body ?? {}) as {
      fileId?: string;
      expiresInMinutes?: number;
      password?: string;
      maxDownloads?: number;
    };

    if (!fileId || typeof fileId !== "string") {
      return NextResponse.json({ ok: false, error: "fileId missing" }, { status: 400 });
    }

    const expMinutes =
      typeof expiresInMinutes === "number" && Number.isFinite(expiresInMinutes)
        ? Math.max(1, Math.floor(expiresInMinutes))
        : undefined;

    const maxDl =
      typeof maxDownloads === "number" && Number.isFinite(maxDownloads)
        ? Math.max(1, Math.floor(maxDownloads))
        : undefined;

    const sb = createAdminClient();

    const { data: file, error: fileErr } = await sb
      .from("files_meta")
      .select("id,user_id,storage_path,file_name")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json({ ok: false, error: "file_not_found" }, { status: 404 });
    }
    if (file.user_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const token = generateShareToken();
    const expires_at = expMinutes
      ? new Date(Date.now() + expMinutes * 60 * 1000).toISOString()
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

    const { error: insErr } = await sb.from("file_shares").insert({
      token,
      file_id: file.id,
      owner_user_id: userId,
      password_algo,
      password_salt,
      password_hash,
      expires_at,
      max_downloads: maxDl ?? null,
    });

    if (insErr) {
      return NextResponse.json({ ok: false, error: "insert_failed", detail: insErr.message }, { status: 500 });
    }

    try {
      await logAudit({
        action: "login_success",
        actorUserId: userId,
        actorEmail: null,
        target: "file_share_create",
        detail: {
          fileId: file.id,
          fileName: file.file_name,
          tokenSuffix: token.slice(-6),
          expires_at,
          maxDownloads: maxDl ?? null,
          hasPassword: !!password_hash,
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, token });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "unexpected", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
