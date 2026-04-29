// src/app/api/journal/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptJournal, decryptJournal } from "@/lib/journal-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 300;
const MAX_CONTENT = 200_000;

type StoredRow = {
  id: string;
  title_enc: string;
  content_enc: string;
  created_at: string;
  updated_at: string;
};

function decryptRow(row: StoredRow, userId: string) {
  return {
    id: row.id,
    title: decryptJournal(row.title_enc, userId),
    content_md: decryptJournal(row.content_enc, userId),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:journal:entries:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("journal_entries")
    .select("id,title_enc,content_enc,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("journal entries GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  try {
    const decrypted = (data ?? []).map((row) => decryptRow(row as StoredRow, userId));
    return NextResponse.json({ ok: true, data: decrypted });
  } catch (err) {
    console.error("journal entries GET decrypt error:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "decrypt error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:journal:entries:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { title?: string; content_md?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.slice(0, MAX_TITLE) : "";
  const content_md =
    typeof body.content_md === "string" ? body.content_md.slice(0, MAX_CONTENT) : "";

  if (!title.trim()) {
    return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
  }

  const title_enc = encryptJournal(title, userId);
  const content_enc = encryptJournal(content_md, userId);

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("journal_entries")
    .insert({ user_id: userId, title_enc, content_enc })
    .select("id,title_enc,content_enc,created_at,updated_at")
    .single();

  if (error) {
    console.error("journal entries POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: decryptRow(data as StoredRow, userId) });
}
