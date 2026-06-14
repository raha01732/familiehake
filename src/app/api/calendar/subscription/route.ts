// src/app/api/calendar/subscription/route.ts
// Verwaltung des persönlichen Abo-Tokens (nur für den eingeloggten Nutzer):
// GET = aktuellen Token holen, POST = neu erzeugen/rotieren, DELETE = widerrufen.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:subscription:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_share_tokens")
    .select("token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("calendar subscription GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: data?.token ?? null });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:subscription:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const token = generateToken();
  const sb = createAdminClient();
  const { error } = await sb
    .from("calendar_share_tokens")
    .upsert({ user_id: userId, token, created_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) {
    console.error("calendar subscription POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token });
}

export async function DELETE(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:subscription:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { error } = await sb.from("calendar_share_tokens").delete().eq("user_id", userId);

  if (error) {
    console.error("calendar subscription DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
