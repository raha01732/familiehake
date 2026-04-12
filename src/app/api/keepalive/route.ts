// /workspace/familiehake/src/app/api/keepalive/route.ts
import { logCronRun } from "@/lib/cron-jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    await logCronRun({
      jobName: "keepalive",
      request: req,
      success: false,
      skipped: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: "supabase not configured",
    });
    return NextResponse.json({ ok: false, error: "supabase not configured" });
  }

  const sb = createAdminClient();
  const pingedAt = new Date().toISOString();
  const { error } = await sb.from("db_heartbeat").insert({ pinged_at: pingedAt });

  if (error) {
    await logCronRun({
      jobName: "keepalive",
      request: req,
      success: false,
      startedAt,
      durationMs: Date.now() - startedAt,
      errorMessage: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await logCronRun({
    jobName: "keepalive",
    request: req,
    success: true,
    startedAt,
    durationMs: Date.now() - startedAt,
    details: { pingedAt },
  });

  return NextResponse.json({ ok: true, pinged_at: pingedAt });
}
