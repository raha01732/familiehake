// src/app/api/keepalive/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ ok: false, error: "supabase not configured" });
  }

  const sb = createAdminClient();
  const pingedAt = new Date().toISOString();
  const { error } = await sb.from("db_heartbeat").insert({ pinged_at: pingedAt });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pinged_at: pingedAt });
}
