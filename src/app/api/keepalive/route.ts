// src/app/api/keepalive/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const sb = createAdminClient();
  const pingedAt = new Date().toISOString();
  const { error } = await sb.from("db_heartbeat").insert({ pinged_at: pingedAt });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pinged_at: pingedAt });
}
