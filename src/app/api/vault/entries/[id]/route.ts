// src/app/api/vault/entries/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptValue } from "@/lib/finance-crypto";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/vault/entries/[id] */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:vault:entries:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  let body: {
    label?: string;
    username?: string | null;
    password?: string;
    url?: string | null;
    notes?: string | null;
    category?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: existing } = await sb
    .from("password_vault_entries")
    .select("id,user_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (body.label?.trim()) {
    patch.label_enc = encryptValue(body.label.trim().slice(0, 200), userId);
  }
  if (body.password) {
    patch.password_enc = encryptValue(body.password.slice(0, 2000), userId);
  }
  if ("username" in body) {
    patch.username_enc = body.username?.trim()
      ? encryptValue(body.username.trim().slice(0, 300), userId)
      : null;
  }
  if ("url" in body) {
    patch.url_enc = body.url?.trim()
      ? encryptValue(body.url.trim().slice(0, 500), userId)
      : null;
  }
  if ("notes" in body) {
    patch.notes_enc = body.notes?.trim()
      ? encryptValue(body.notes.trim().slice(0, 2000), userId)
      : null;
  }
  if (body.category) {
    patch.category = body.category.slice(0, 64);
  }

  const { error } = await sb
    .from("password_vault_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("vault PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "vault_entry_update",
    actorUserId: userId,
    actorEmail: null,
    target: `password_vault_entries:${id}`,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/vault/entries/[id] */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:vault:entries:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sb = createAdminClient();

  const { data: existing } = await sb
    .from("password_vault_entries")
    .select("id,user_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const { error } = await sb
    .from("password_vault_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("vault DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "vault_entry_delete",
    actorUserId: userId,
    actorEmail: null,
    target: `password_vault_entries:${id}`,
  });

  return NextResponse.json({ ok: true });
}
