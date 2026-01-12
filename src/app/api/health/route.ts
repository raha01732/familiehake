// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: {
    uptime_s: number;
    env: Record<string, Record<string, boolean>>;
    db: {
      ok: boolean;
      info: string | null;
      tables: { total: number; reachable: number; errors: string[] };
    };
  } = {
    uptime_s: Math.floor(process.uptime()),
    env: {
      clerk: {
        publishable_key: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        secret_key: !!process.env.CLERK_SECRET_KEY,
      },
      supabase: {
        url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      sentry: {
        dsn: !!process.env.SENTRY_DSN,
        api_token: !!process.env.SENTRY_API_TOKEN,
        org_slug: !!process.env.SENTRY_ORG_SLUG,
        project_slug: !!process.env.SENTRY_PROJECT_SLUG,
      },
      upstash: {
        redis_rest_url: !!process.env.UPSTASH_REDIS_REST_URL,
        redis_rest_token: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      },
    },
    db: {
      ok: false,
      info: null,
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

  const allEnvOk = Object.values(checks.env).every((service) => Object.values(service).every(Boolean));
  if (!allEnvOk && status === "ok") status = "warn";

  // immer 200, Zustand im Payload
  return NextResponse.json({ status, checks });
}
