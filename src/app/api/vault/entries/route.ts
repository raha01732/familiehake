// src/app/api/vault/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptValue, decryptValue } from "@/lib/finance-crypto";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type VaultEntry = {
  id: string;
  label: string;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
  category: string;
  created_at: string;
  updated_at: string;
};

/** GET /api/vault/entries */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:vault:entries:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("password_vault_entries")
    .select("id,label_enc,username_enc,password_enc,url_enc,notes_enc,category,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("vault GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const entries: VaultEntry[] = (data ?? []).map((row) => {
    let label = "";
    let username: string | null = null;
    let password = "";
    let url: string | null = null;
    let notes: string | null = null;

    try { label = decryptValue(row.label_enc, userId); } catch { label = "(Entschlüsselungsfehler)"; }
    try { password = decryptValue(row.password_enc, userId); } catch { password = ""; }
    if (row.username_enc) { try { username = decryptValue(row.username_enc, userId); } catch { username = null; } }
    if (row.url_enc) { try { url = decryptValue(row.url_enc, userId); } catch { url = null; } }
    if (row.notes_enc) { try { notes = decryptValue(row.notes_enc, userId); } catch { notes = null; } }

    return {
      id: row.id,
      label,
      username,
      password,
      url,
      notes,
      category: row.category,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return NextResponse.json({ ok: true, data: entries });
}

/** POST /api/vault/entries */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:vault:entries:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    label: string;
    username?: string | null;
    password: string;
    url?: string | null;
    notes?: string | null;
    category?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { label, username, password, url, notes, category = "sonstiges" } = body;

  if (!label || typeof label !== "string" || label.trim().length === 0 || label.length > 200) {
    return NextResponse.json({ ok: false, error: "invalid label" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length === 0 || password.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid password" }, { status: 400 });
  }

  const label_enc = encryptValue(label.trim(), userId);
  const password_enc = encryptValue(password, userId);
  const username_enc = username?.trim() ? encryptValue(username.trim().slice(0, 300), userId) : null;
  const url_enc = url?.trim() ? encryptValue(url.trim().slice(0, 500), userId) : null;
  const notes_enc = notes?.trim() ? encryptValue(notes.trim().slice(0, 2000), userId) : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("password_vault_entries")
    .insert({
      user_id: userId,
      label_enc,
      username_enc,
      password_enc,
      url_enc,
      notes_enc,
      category: (typeof category === "string" ? category : "sonstiges").slice(0, 64),
    })
    .select("id,category,created_at,updated_at")
    .single();

  if (error) {
    console.error("vault POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "vault_entry_create",
    actorUserId: userId,
    actorEmail: null,
    target: `password_vault_entries:${data.id}`,
    detail: { category: data.category },
  });

  const result: VaultEntry = {
    id: data.id,
    label: label.trim(),
    username: username?.trim() || null,
    password,
    url: url?.trim() || null,
    notes: notes?.trim() || null,
    category: data.category,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return NextResponse.json({ ok: true, data: result }, { status: 201 });
}
