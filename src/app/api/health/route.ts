// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    db: {
      ok: false,
      info: null as null | string,
      tables: { total: 0, reachable: 0, errors: [] as string[] },
    },
  };

  let status: "ok" | "warn" | "degraded" = "ok";
  try {
    const sb = createClient();
    const tableNames = [
      "access_rules",
      "roles",
      "user_roles",
      "audit_events",
      "files_meta",
      "file_shares",
      "folders",
      "journal_entries",
      "calendar_events",
      "messages",
      "user_keys",
      "movies",
      "shows",
    ];

    const results = await Promise.all(
      tableNames.map(async (table) => {
        const { error } = await sb.from(table).select("*", { count: "exact", head: true });
        return { table, error };
      })
    );

    const errors = results
      .filter((result) => result.error)
      .map((result) => `${result.table}: ${result.error?.message ?? "unknown error"}`);

    checks.db.tables.total = tableNames.length;
    checks.db.tables.reachable = tableNames.length - errors.length;
    checks.db.tables.errors = errors;

    checks.db.ok = errors.length === 0;
    checks.db.info = `Tabellen erreichbar: ${checks.db.tables.reachable}/${checks.db.tables.total}`;
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
