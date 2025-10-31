/**src/app/monitoring/page.tsx**/

import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "System Monitoring" };

export default async function MonitoringPage() {
  const sb = createClient();
  const user = await currentUser();

  const checks = {
    uptime_s: process.uptime(),
    env: {
      clerk_publishable: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      clerk_secret: !!process.env.CLERK_SECRET_KEY,
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      sentry_dsn: !!process.env.SENTRY_DSN,
    },
    db: { ok: false, info: "" },
  };

  try {
    const { error } = await sb.from("audit_log").select("id").limit(1);
    if (!error) checks.db = { ok: true, info: "select ok" };
    else checks.db = { ok: false, info: error.message };
  } catch (e: any) {
    checks.db = { ok: false, info: e?.message || "DB unreachable" };
  }

  const envOk = Object.values(checks.env).every(Boolean);
  const overallOk = envOk && checks.db.ok;

  const status = overallOk ? "healthy" : checks.db.ok ? "warn" : "unreachable";

  return (
    <RoleGate routeKey="admin/monitoring">
      <section className="p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
          System Monitoring
        </h1>

        <Card className="bg-zinc-900/60 border border-zinc-800">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-zinc-400">Status</div>
                <div
                  className={`text-lg font-medium ${
                    status === "healthy"
                      ? "text-green-400"
                      : status === "warn"
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                >
                  {status}
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                Laufzeit: {Math.floor(checks.uptime_s)} s
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wide">
                  Environment
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(checks.env).map(([key, ok]) => (
                    <BoolPill key={key} ok={ok} label={key} />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wide">
                  Datenbank
                </div>
                <BoolPill ok={checks.db.ok} label={checks.db.info} />
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wide">
                  Benutzer
                </div>
                <BoolPill ok={!!user} label={user ? "angemeldet" : "nicht angemeldet"} />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </RoleGate>
  );
}

/** Kleine Status-Pille (grün = ok, orange = warn) */
function BoolPill({ ok, label }: { ok: boolean; label: string }) {
  const cls = ok
    ? "border-green-700 text-green-300 bg-green-900/20"
    : "border-amber-600 text-amber-300 bg-amber-900/20";
  return (
    <span
      className={`px-2 py-0.5 border rounded-lg text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
