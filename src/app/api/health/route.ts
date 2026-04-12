// /workspace/familiehake/src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/sentry";
import { getClerkPublishableKey } from "@/lib/env";

export const dynamic = "force-dynamic";

const UPSTASH_HEARTBEAT_KEY = "ops:heartbeat:upstash";
const FORCE_LOGOUT_HEARTBEAT_KEY = "ops:heartbeat:force-logout";
const UPSTASH_HEARTBEAT_MAX_AGE_MS = 1000 * 60 * 60 * 26;
const FORCE_LOGOUT_HEARTBEAT_MAX_AGE_MS = 1000 * 60 * 60 * 30;

type HealthChecks = {
  uptime_s: number;
  env: Record<string, Record<string, boolean>>;
  db: {
    ok: boolean;
    info: string | null;
    tables: { total: number; reachable: number; errors: string[] };
    heartbeat: { ok: boolean; last_pinged_at: string | null; info: string | null };
  };
  upstash: {
    ok: boolean;
    info: string | null;
    heartbeat: { ok: boolean; last_pinged_at: string | null; info: string | null };
    force_logout: { ok: boolean; last_pinged_at: string | null; info: string | null };
  };
};

export async function GET() {
  const checks: HealthChecks = {
    uptime_s: Math.floor(process.uptime()),
    env: {
      clerk: {
        publishable_key: !!getClerkPublishableKey(),
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
      tables: { total: 0, reachable: 0, errors: [] },
      heartbeat: { ok: false, last_pinged_at: null, info: null },
    },
    upstash: {
      ok: false,
      info: null,
      heartbeat: { ok: false, last_pinged_at: null, info: null },
      force_logout: { ok: false, last_pinged_at: null, info: null },
    },
  };

  let status: "ok" | "warn" | "degraded" = "ok";

  try {
    const sb = createAdminClient();
    const { data: tablesData, error: tablesError } = await sb.rpc("get_public_tables");
    const tableNames = Array.isArray(tablesData)
      ? tablesData.map((row: { table_name: string }) => row.table_name).filter(Boolean)
      : [];

    if (tablesError) {
      throw new Error(tablesError.message);
    }

    const [results, heartbeatResult] = await Promise.all([
      Promise.all(
        tableNames.map(async (table) => {
          const { error } = await sb.from(table).select("*", { count: "exact", head: true });
          return { table, error };
        })
      ),
      sb.from("db_heartbeat").select("pinged_at").order("pinged_at", { ascending: false }).limit(1),
    ]);

    const errors = results
      .filter((result) => result.error)
      .map((result) => `${result.table}: ${result.error?.message ?? "unknown error"}`);

    checks.db.tables.total = tableNames.length;
    checks.db.tables.reachable = tableNames.length - errors.length;
    checks.db.tables.errors = errors;
    checks.db.ok = errors.length === 0 && tableNames.length > 0;
    checks.db.info = `Tabellen erreichbar: ${checks.db.tables.reachable}/${checks.db.tables.total}`;

    if (heartbeatResult.error) {
      checks.db.heartbeat.ok = false;
      checks.db.heartbeat.info = heartbeatResult.error.message;
    } else {
      const lastPing = heartbeatResult.data?.[0]?.pinged_at ?? null;
      const today = new Date().toISOString().slice(0, 10);
      const lastPingDay = lastPing ? new Date(lastPing).toISOString().slice(0, 10) : null;
      const dbHeartbeatOk = lastPingDay === today;
      checks.db.heartbeat.last_pinged_at = lastPing;
      checks.db.heartbeat.ok = dbHeartbeatOk;
      checks.db.heartbeat.info = dbHeartbeatOk ? "Heartbeat aktuell" : "Kein Heartbeat heute";

      if (!dbHeartbeatOk) {
        reportError(new Error("db_heartbeat_missing"), { lastPing, today });
        if (status === "ok") status = "warn";
      }
    }
  } catch (error: any) {
    checks.db.ok = false;
    checks.db.info = error?.message ?? "db error";
    status = "degraded";
  }

  try {
    const redis = getRedisClient();
    if (!redis) {
      checks.upstash.ok = false;
      checks.upstash.info = "Upstash nicht konfiguriert";
      checks.upstash.heartbeat.info = "upstash_not_configured";
      checks.upstash.force_logout.info = "upstash_not_configured";
      if (status === "ok") status = "warn";
    } else {
      const [value, forceLogoutHeartbeat] = await Promise.all([
        redis.get<string>(UPSTASH_HEARTBEAT_KEY),
        redis.get<{ finishedAt?: string }>(FORCE_LOGOUT_HEARTBEAT_KEY),
      ]);
      const now = Date.now();
      const lastPing = typeof value === "string" ? value : null;
      const ageMs = lastPing ? now - new Date(lastPing).getTime() : null;
      const upstashHeartbeatOk = !!lastPing && Number.isFinite(ageMs) && (ageMs as number) <= UPSTASH_HEARTBEAT_MAX_AGE_MS;

      checks.upstash.ok = upstashHeartbeatOk;
      checks.upstash.info = upstashHeartbeatOk ? "Redis erreichbar" : "Redis Heartbeat veraltet/fehlt";
      checks.upstash.heartbeat.last_pinged_at = lastPing;
      checks.upstash.heartbeat.ok = upstashHeartbeatOk;
      checks.upstash.heartbeat.info = upstashHeartbeatOk
        ? "Heartbeat aktuell"
        : "Kein aktueller Upstash-Heartbeat";

      const forceLogoutLastPing =
        typeof forceLogoutHeartbeat === "object" && forceLogoutHeartbeat?.finishedAt
          ? forceLogoutHeartbeat.finishedAt
          : null;
      const forceLogoutAgeMs = forceLogoutLastPing ? now - new Date(forceLogoutLastPing).getTime() : null;
      const forceLogoutOk =
        !!forceLogoutLastPing &&
        Number.isFinite(forceLogoutAgeMs) &&
        (forceLogoutAgeMs as number) <= FORCE_LOGOUT_HEARTBEAT_MAX_AGE_MS;

      checks.upstash.force_logout.last_pinged_at = forceLogoutLastPing;
      checks.upstash.force_logout.ok = forceLogoutOk;
      checks.upstash.force_logout.info = forceLogoutOk
        ? "Force-Logout Cron aktuell"
        : "Kein aktueller Force-Logout-Heartbeat";

      if (!upstashHeartbeatOk && status === "ok") {
        status = "warn";
      }
      if (!forceLogoutOk && status === "ok") {
        status = "warn";
      }
    }
  } catch (error) {
    reportError(error, { check: "upstash_health" });
    checks.upstash.ok = false;
    checks.upstash.info = "Upstash Check fehlgeschlagen";
    checks.upstash.heartbeat.ok = false;
    checks.upstash.heartbeat.info = "upstash_check_failed";
    if (status === "ok") status = "warn";
  }

  const allEnvOk = Object.values(checks.env).every((service) => Object.values(service).every(Boolean));
  if (!allEnvOk && status === "ok") status = "warn";

  return NextResponse.json({ status, checks });
}
