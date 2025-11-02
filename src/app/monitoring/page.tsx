import { RoleGate } from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { PERMISSION_LABELS, PERMISSION_LEVELS } from "@/lib/rbac";
import { fetchSentryStats } from "@/lib/sentry-metrics";
import { getStorageUsageSummary } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "System Monitoring" };

type HealthPayload = {
  status: "ok" | "warn" | "degraded";
  checks: {
    uptime_s: number;
    env: Record<string, boolean>;
    db: { ok: boolean; info?: string };
  };
};

async function getHealth(): Promise<HealthPayload | null> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthPayload;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function serverInfo() {
  const mem = (global as any).process?.memoryUsage?.() ?? null;
  return {
    node: process.version,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    region: process.env.VERCEL_REGION ?? null,
    rss: mem?.rss ?? null,
    heap: mem?.heapUsed ?? null,
  };
}

export default async function MonitoringPage() {
  // Nur das laden, was in dieser Komponente direkt genutzt wird
  const [health, storage, sentry] = await Promise.all([
    getHealth(),
    getStorageUsageSummary(),
    fetchSentryStats(),
  ]);

  const status: "ok" | "warn" | "degraded" | "unreachable" =
    (health?.status as any) ?? "unreachable";
  const env = (health?.checks?.env ?? {}) as Record<string, boolean>;
  const db = (health?.checks?.db as { ok: boolean; info?: string }) ?? { ok: false };
  const srv = serverInfo();

  const envRows: Array<[string, boolean]> = [
    ["Clerk Publishable Key", !!env.clerk_publishable],
    ["Clerk Secret Key", !!env.clerk_secret],
    ["Supabase URL", !!env.supabase_url],
    ["Supabase Anon Key", !!env.supabase_anon],
    ["Supabase Service Key", !!env.supabase_service],
    ["Sentry DSN", !!env.sentry_dsn],
  ];

  return (
    <RoleGate routeKey="monitoring">
      <section className="p-6 flex flex-col gap-6">
        {/* Health */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Health-Check</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">/api/health – Server & DB</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-zinc-300 text-sm">Status</div>
                  <span className="rounded-lg border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200">
                    {status}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="text-xs text-zinc-400 uppercase tracking-wide">Environment</div>
                  <div className="grid gap-1">
                    {envRows.map(([label, ok]) => (
                      <EnvRow key={label} label={label} ok={ok} />
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid gap-1">
                  <div className="text-xs text-zinc-400 uppercase tracking-wide">Datenbank</div>
                  <div className="flex items-center justify-between">
                    <div className="text-zinc-200 text-sm">Connectivity</div>
                    <span
                      className={`px-2 py-0.5 border rounded-lg text-xs font-medium ${
                        db.ok
                          ? "border-green-700 text-green-300 bg-green-900/20"
                          : "border-amber-600 text-amber-300 bg-amber-900/20"
                      }`}
                    >
                      {db.ok ? "OK" : "Fehler"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">{db.info ?? "–"}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-400 uppercase tracking-wide">Server</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                  <div>Node</div><div className="text-zinc-200">{srv.node}</div>
                  <div>Env</div><div className="text-zinc-200">{srv.env}</div>
                  <div>Region</div><div className="text-zinc-200">{srv.region ?? "–"}</div>
                  <div>RSS</div><div className="text-zinc-200">{formatBytes(srv.rss)}</div>
                  <div>Heap</div><div className="text-zinc-200">{formatBytes(srv.heap)}</div>
                  <div>Uptime</div><div className="text-zinc-200">{health?.checks?.uptime_s ?? "–"}s</div>
                </div>

                <div className="mt-4 text-xs text-zinc-400 uppercase tracking-wide">Sentry</div>
                <div className="mt-1 grid gap-1 text-xs text-zinc-300">
                  <div>Events 24h: {sentry?.events24h ?? "—"}</div>
                  <div>Rejected 24h: {sentry?.rejected24h ?? "—"}</div>
                  <div>Unresolved Issues: {sentry?.unresolvedIssues ?? "—"}</div>
                  <div>Letztes Release: {sentry?.latestRelease ?? "—"}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Berechtigungen – lädt sich selbst */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Module &amp; Rechte</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Wer darf was? (live aus DB)</p>
          </div>
          <Permissions />
        </div>

        {/* Storage */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Speicher</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Dateien & Freigaben (Supabase)</p>
          </div>
          <div className="grid gap-2 text-sm">
            <KV label="Dateien gesamt" value={String(storage.totalFiles)} />
            <KV label="Gesamtgröße" value={formatBytes(storage.totalBytes)} />
            <KV
              label="Papierkorb"
              value={`${storage.trashedFiles} Dateien · ${formatBytes(storage.trashedBytes)}`}
            />
            <KV label="Aktive Freigaben" value={String(storage.activeShares)} />
          </div>
        </div>

        {/* Audit-Events – lädt sich selbst */}
        <AuditTable />
      </section>
    </RoleGate>
  );
}

async function Permissions() {
  const { roles, matrix } = await getPermissionOverview();
  return (
    <div className="grid gap-3 text-sm">
      {Object.entries(matrix).map(([route, roleLevels]) => (
        <div
          key={route}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="mb-2 sm:mb-0">
            <div className="text-zinc-100 font-medium text-sm">/{route}</div>
            <div className="text-zinc-500 text-xs">
              {roles
                .map((r) => {
                  const level = roleLevels[r.name] ?? PERMISSION_LEVELS.NONE;
                  return `${r.label}: ${PERMISSION_LABELS[level]}`;
                })
                .join(" • ")}
            </div>
          </div>
          <span className="text-[11px] text-zinc-400">Status: aktiv</span>
        </div>
      ))}
    </div>
  );
}

async function AuditTable() {
  const sb = createClient();
  const { data: events } = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Letzte Ereignisse</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">Neueste 50 aus audit_events</p>
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
            {(events ?? []).map((e: any, idx: number) => (
              <tr key={idx}>
                <td className="px-3 py-2 text-zinc-300 text-xs whitespace-nowrap">{formatDate(e.ts)}</td>
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
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-zinc-300">{label}</div>
      <div className="text-zinc-100 font-medium">{value}</div>
    </div>
  );
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  const cls = ok
    ? "border-green-700 text-green-300 bg-green-900/20"
    : "border-amber-600 text-amber-300 bg-amber-900/20";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-200">{label}</div>
        <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${cls}`}>{ok ? "OK" : "Fehlt"}</span>
      </div>
    </div>
  );
}
