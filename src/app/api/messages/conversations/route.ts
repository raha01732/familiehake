// src/app/api/messages/conversations/route.ts
// Liste der bisherigen Chat-Partner:innen (mit letztem Nachrichtenzeitpunkt)
// für den aktuellen Nutzer – Basis für die Unterhaltungsliste im
// Nachrichten-Tool, damit man nicht mehr die rohe Clerk-User-ID eintippen muss.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROWS = 500;

export type ConversationEntry = { peerId: string; lastMessageAt: string };

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:messages:conversations");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("messages")
    .select("sender_id,recipient_id,created_at")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error("messages/conversations GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const lastMessageAt = new Map<string, string>();
  for (const row of data ?? []) {
    const peerId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (!lastMessageAt.has(peerId)) lastMessageAt.set(peerId, row.created_at as string);
  }

  const conversations: ConversationEntry[] = Array.from(lastMessageAt, ([peerId, at]) => ({
    peerId,
    lastMessageAt: at,
  }));

  return NextResponse.json({ ok: true, data: conversations });
}
