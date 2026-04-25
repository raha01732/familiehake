// src/app/api/journal/draft/route.ts
// Autosave-Drafts in Redis. Schützt vor verlorenen Texten bei Browser-Crashes.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { applyRateLimit } from "@/lib/ratelimit";
import { getRedisClient, getCachedJson, setCachedJson } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_SECONDS = 60 * 60 * 24; // 24 h
const MAX_TITLE = 300;
const MAX_CONTENT = 200_000; // 200 kB Markdown reicht locker

export type JournalDraft = {
  entryId: string; // "new" für noch nicht gespeicherte Einträge
  title: string;
  content_md: string;
  saved_at: string;
};

function key(userId: string, entryId: string): string {
  return `journal:draft:${userId}:${entryId}`;
}

function validEntryId(id: string | null): id is string {
  if (!id) return false;
  if (id === "new") return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** GET /api/journal/draft?entryId=...  */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:journal:draft:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!validEntryId(entryId)) {
    return NextResponse.json({ ok: false, error: "invalid entryId" }, { status: 400 });
  }

  const draft = await getCachedJson<JournalDraft>(key(userId, entryId));
  return NextResponse.json({ ok: true, data: draft ?? null });
}

/** PUT /api/journal/draft  body: {entryId, title, content_md} */
export async function PUT(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:journal:draft:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { entryId?: string; title?: string; content_md?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const entryId = body.entryId ?? null;
  if (!validEntryId(entryId)) {
    return NextResponse.json({ ok: false, error: "invalid entryId" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.slice(0, MAX_TITLE) : "";
  const content_md = typeof body.content_md === "string" ? body.content_md.slice(0, MAX_CONTENT) : "";

  const draft: JournalDraft = {
    entryId,
    title,
    content_md,
    saved_at: new Date().toISOString(),
  };
  await setCachedJson(key(userId, entryId), draft, TTL_SECONDS);

  return NextResponse.json({ ok: true, data: draft });
}

/** DELETE /api/journal/draft?entryId=... — Aufräumen nach erfolgreichem Save in DB */
export async function DELETE(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:journal:draft:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!validEntryId(entryId)) {
    return NextResponse.json({ ok: false, error: "invalid entryId" }, { status: 400 });
  }

  const client = getRedisClient();
  if (client) {
    try {
      await client.del(key(userId, entryId));
    } catch {
      // best-effort
    }
  }
  return NextResponse.json({ ok: true });
}
