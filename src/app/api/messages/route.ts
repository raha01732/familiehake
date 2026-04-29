// src/app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CIPHERTEXT = 64_000;
const MAX_USER_ID = 200;

function validUserId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_USER_ID;
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:messages:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const peer = req.nextUrl.searchParams.get("peer");
  if (!validUserId(peer)) {
    return NextResponse.json({ ok: false, error: "invalid peer" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("messages")
    .select("id,sender_id,recipient_id,ciphertext,created_at")
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${userId})`,
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("messages GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:messages:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { recipient_id?: string; ciphertext?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (!validUserId(body.recipient_id)) {
    return NextResponse.json({ ok: false, error: "invalid recipient_id" }, { status: 400 });
  }
  if (
    typeof body.ciphertext !== "string" ||
    body.ciphertext.length === 0 ||
    body.ciphertext.length > MAX_CIPHERTEXT
  ) {
    return NextResponse.json({ ok: false, error: "invalid ciphertext" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("messages")
    .insert({
      sender_id: userId,
      recipient_id: body.recipient_id,
      ciphertext: body.ciphertext,
    })
    .select("id,sender_id,recipient_id,ciphertext,created_at")
    .single();

  if (error) {
    console.error("messages POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
