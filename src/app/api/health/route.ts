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
    db: { ok: false, info: null as null | string },
  };

  let status: "ok" | "warn" | "degraded" = "ok";
  try {
    const sb = createAdminClient();
    // einfache, harmlose Abfrage als Connectivity-Proof
    const { error } = await sb.from("role_permissions").select("route").limit(1);
    if (error) throw error;
    checks.db.ok = true;
    checks.db.info = "select ok";
  } catch (e: any) {
    checks.db.ok = false;
    checks.db.info = e?.message ?? "db error";
    status = "degraded";
  }

  const allEnvOk = Object.values(checks.env).every(Boolean);
  if (!allEnvOk && status === "ok") status = "warn";

  // immer 200, Zustand im Payload
  return NextResponse.json({ status, checks });
}
