import { RoleGate } from "@/components/RoleGate";
import { getAccessMapFromDb } from "@/lib/access-db";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export const metadata = { title: "Monitoring | Private Tools" };

/** Health sauber via absolute URL (funktioniert auf Vercel & lokal) */
async function getHealth() {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getLatestEvents() {
  const sb = createClient();
  const { data } = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Kleine UI-Helper */
function StatusPill({ s }: { s: "ok" | "warn" | "degraded" | "unreachable" }) {
  const cls =
    s === "ok"
      ? "border-green-700 text-green-300 bg-green-900/20"
      : s === "warn"
      ? "border-amber-600 text-amber-300 bg-amber-900/20"
      : s === "degraded"
      ? "border-red-700 text-red-300 bg-red-900/20"
      : "border-zinc-600 text-zinc-300 bg-zinc-800/30";
  return <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{s}</span>;
}

function BoolPill({ ok, label }: { ok: boolean; label: string }) {
  const cls = ok
    ? "border-green-700 text-green-300 bg-green-900/20"
    : "border-amber-600 text-amber-300 bg-amber-900/20";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">{label}</div>
        <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${cls}`}>{ok ? "OK" : "Fehlt"}</span>
      </div>
    </div>
  );
}

export default async function MonitoringPage() {
  const [accessMap, events, health] = await Promise.all([
    getAccessMapFromDb(),
    getLatestEvents(),
    getHealth(),
  ]);

  const status: "ok" | "warn" | "degraded" | "unreachable" = (health?.status as any) ?? "unreachable";
  const uptime = health?.checks?.uptime_s ?? null;
  const env = (health?.checks?.env as Record<string, boolean>) ?? {};
  const db = (health?.checks?.db as { ok: boolean; info?: string }) ?? { ok: false, info: "no data" };

  // Reihenfolge & Labels der ENV-Checks hübsch definieren
  const envOrder: Array<[keyof typeof env, string]> = [
    ["clerk_publishable", "Clerk Publishable Key"],
    ["clerk_secret", "Clerk Secret Key"],
    ["supabase_url", "Supabase URL"],
    ["supabase_anon", "Supabase Anon Key"],
    ["supabase_service", "Supabase Service Key"],
    ["sentry_dsn", "Sentry DSN (optional)"],
  ].filter(([k]) => k in env) as any;

  return (
    <RoleGate routeKey="monitoring">
      <section className="grid gap-6">
        {/* Systemstatus (schön) */}
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Systemstatus</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Gesamter Zustand der Plattform inkl. Environment & Datenbank.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500 mb-1">Gesamt</div>
              <StatusPill s={status} />
            </div>
          </div>

          {/* Kacheln: Uptime, DB, ENV */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Uptime */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-sm text-zinc-200 mb-2">Uptime</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {uptime !== null ? `${uptime}s` : "—"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Seit App-Start</div>
            </div>

            {/* DB */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-200">Datenbank</div>
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[11px] ${
                    db.ok
                      ? "border-green-700 text-green-300 bg-green-900/20"
                      : "border-red-700 text-red-300 bg-red-900/20"
                  }`}
                >
                  {db.ok ? "OK" : "Fehler"}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-2 break-all">
                {db.info ?? "—"}
              </div>
            </div>

            {/* ENV-Übersicht (Kurz) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-sm text-zinc-200 mb-2">Environment</div>
              <div className="grid gap-2">
                {envOrder.map(([key, label]) => (
                  <div key={String(key)} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{label}</span>
                    <span
                      className={`rounded-md border px-2 py-0.5 ${
                        env[key]
                          ? "border-green-700 text-green-300 bg-green-900/20"
                          : "border-amber-600 text-amber-300 bg-amber-900/20"
                      }`}
                    >
                      {env[key] ? "gesetzt" : "fehlt"}
                    </span>
                  </div>
                ))}
                {envOrder.length === 0 && (
                  <div className="text-[11px] text-zinc-500">Keine ENV-Daten.</div>
                )}
              </div>
            </div>
          </div>

          {/* Optional: Vollständige JSON-Rohdaten ein/ausblendbar */}
          <details className="mt-2">
            <summary className="text-xs text-zinc-500 cursor-pointer">Rohdaten anzeigen</summary>
            <pre className="mt-2 text-[11px] text-zinc-400 whitespace-pre-wrap">
              {JSON.stringify(health ?? { status: "unreachable", checks: {} }, null, 2)}
            </pre>
          </details>
        </div>

        {/* Module & Berechtigungen (aus DB) */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Module &amp; Berechtigungen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Wer darf wohin? (live aus DB)</p>
          </div>
          <div className="grid gap-3 text-sm">
            {Object.entries(accessMap).map(([route, roles]) => (
              <div
                key={route}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="mb-2 sm:mb-0">
                  <div className="text-zinc-100 font-medium text-sm">/{route}</div>
                  <div className="text-zinc-500 text-xs">Sichtbar für: {roles.join(", ")}</div>
                </div>
                <div className="text-[11px] text-zinc-400">Status: aktiv</div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit-Events */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Letzte Ereignisse</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Echte Audit-Logs (neueste 50).</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-medium">Zeit</th>
                  <th className="px-3 py-2 font-medium">Aktion</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Ziel</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {events.map((e: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-zinc-300 text-xs whitespace-nowrap">
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-300 text-xs">{e.action}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{e.actor_email ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{e.target ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px]">
                      {e.detail ? JSON.stringify(e.detail) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-zinc-600">Quelle: Supabase audit_events</div>
        </div>
      </section>
    </RoleGate>
  );
}
