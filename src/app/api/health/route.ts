import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, any> = {
    uptime_s: Math.floor(process.uptime()),
    env: {
      clerk_publishable: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      clerk_secret: !!process.env.CLERK_SECRET_KEY,
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      sentry_dsn: !!process.env.SENTRY_DSN,
    },
    db: { ok: false, now: null as null | string },
  };

  // DB-Check (Service Role -> bypass RLS)
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.rpc("now"); // versucht Postgres now(); existiert evtl. nicht
    if (error) {
      // fallback: einfache Query
      const { data: ping, error: e2 } = await sb.from("tools_access").select("route").limit(1);
      if (e2) throw e2;
      checks.db.ok = true;
      checks.db.now = new Date().toISOString();
    } else {
      checks.db.ok = true;
      checks.db.now = String(data);
    }
  } catch (e: any) {
    return NextResponse.json({ status: "degraded", checks, error: e?.message ?? "db error" }, { status: 503 });
  }

  const allEnvOk = Object.values(checks.env).every(Boolean);
  return NextResponse.json(
    { status: allEnvOk ? "ok" : "warn", checks },
    { status: 200 }
  );
}
