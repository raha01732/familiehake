import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPasswordScrypt, isShareActive } from "@/lib/share";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /s/:token?password=optional
 * Prüft Token (+ ggf. Passwort), erhöht downloads_count, gibt signierte URL zurück (Redirect).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ ok: false, error: "missing token" }, { status: 400 });

  const password = req.nextUrl.searchParams.get("password") || undefined;
  if (password && password.length > 1024) {
    return NextResponse.json({ ok: false, error: "password_too_long" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: share, error } = await sb
    .from("file_shares")
    .select(
      `
      id, token, file_id, owner_user_id, expires_at, max_downloads, downloads_count, revoked_at,
      password_algo, password_salt, password_hash,
      files_meta: file_id ( storage_path, file_name )
    `
    )
    .eq("token", token)
    .single();

  if (error || !share) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  if (!isShareActive(share)) {
    await logAudit({
      action: "file_share_access_denied",
      actorUserId: null,
      actorEmail: null,
      target: share.file_id,
      detail: { reason: "expired_or_revoked_or_limit", token_suffix: token.slice(-6) },
    });
    return NextResponse.json({ ok: false, error: "expired_or_revoked" }, { status: 410 });
  }

  // Passwortpflicht?
  if (share.password_hash && share.password_salt) {
    if (!password) {
      return NextResponse.json({ ok: false, error: "password_required" }, { status: 401 });
    }
    const ok = await verifyPasswordScrypt(password, share.password_salt, share.password_hash);
    if (!ok) {
      await logAudit({
        action: "file_share_access_denied",
        actorUserId: null,
        actorEmail: null,
        target: share.file_id,
        detail: { reason: "bad_password", token_suffix: token.slice(-6) },
      });
      return NextResponse.json({ ok: false, error: "bad_password" }, { status: 401 });
    }
  }

  // signierte URL erstellen
  // files_meta ist ein Supabase-Join — kann als Array oder Objekt zurückkommen
  const fileMeta = Array.isArray(share.files_meta) ? share.files_meta[0] : share.files_meta;
  const storage_path = (fileMeta as { storage_path?: string } | null)?.storage_path;
  if (!storage_path) {
    return NextResponse.json({ ok: false, error: "file_missing" }, { status: 500 });
  }

  const { data: signed, error: signErr } = await sb.storage.from("files").createSignedUrl(storage_path, 60);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: signErr?.message || "sign_failed" }, { status: 500 });
  }

  // downloads_count++ (best-effort, Fehler ignorieren)
  try {
    const { error: rpcErr } = await sb.rpc("increment_share_downloads", { p_share_id: share.id });
    if (rpcErr) {
      // Fallback ohne RPC:
      await sb.from("file_shares").update({ downloads_count: (share.downloads_count ?? 0) + 1 }).eq("id", share.id);
    }
  } catch {
    // Zähler-Fehler sind nicht fatal
  }

  await logAudit({
    action: "file_share_access",
    actorUserId: null,
    actorEmail: null,
    target: share.file_id,
    detail: { token_suffix: token.slice(-6) },
  });

  return NextResponse.redirect(signed.signedUrl);
}
