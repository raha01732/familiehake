// src/app/api/keys/route.ts
// Public-Key-Lookup für E2E-Messaging.
// GET: Public Key eines beliebigen Users (nur für authentifizierte Nutzer).
// PUT: Eigenen Public Key veröffentlichen.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_USER_ID = 200;
const MAX_PEM = 8_000;

function validUserId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_USER_ID;
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:keys:get");
  if (rl instanceof NextResponse) return rl;

  const { userId: requesterId } = await auth();
  if (!requesterId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const targetUserId = req.nextUrl.searchParams.get("userId");
  if (!validUserId(targetUserId)) {
    return NextResponse.json({ ok: false, error: "invalid userId" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("user_keys")
    .select("public_key_pem")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error("keys GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? null });
}

export async function PUT(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:keys:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { public_key_pem?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body.public_key_pem !== "string" ||
    body.public_key_pem.length === 0 ||
    body.public_key_pem.length > MAX_PEM ||
    !body.public_key_pem.includes("-----BEGIN PUBLIC KEY-----")
  ) {
    return NextResponse.json({ ok: false, error: "invalid public_key_pem" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("user_keys")
    .upsert(
      { user_id: userId, public_key_pem: body.public_key_pem },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("keys PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
