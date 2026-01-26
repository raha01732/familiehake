// /workspace/familiehake/src/app/monitoring/page.tsx
import RoleGate from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { ACCESS_LABELS } from "@/lib/rbac";
import { fetchSentryStats } from "@/lib/sentry-metrics";
import { getStorageUsageSummary, type StorageUsageSummary } from "@/lib/stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "System Monitoring" };

const EMPTY_STORAGE: StorageUsageSummary = {
  totalFiles: 0,
  totalBytes: 0,
  trashedFiles: 0,
  trashedBytes: 0,
  activeShares: 0,
  revokedShares: 0,
  expiredShares: 0,
  expiringSoon: 0,
  recentShares: [],
};

type HealthPayload = {
  status: "ok" | "warn" | "degraded";
  checks: {
    uptime_s: number;
    env: Record<string, Record<string, boolean>>;
    db: {
      ok: boolean;
      info?: string;
      tables?: { total: number; reachable: number; errors: string[] };
      heartbeat?: { ok: boolean; last_pinged_at: string | null; info: string | null };
    };
  };
};

type AuditEvent = {
  ts: string;
  action: string;
  actor_email?: string | null;
  target?: string | null;
  detail?: unknown;
};

type HeartbeatEvent = {
  id: number;
  pinged_at: string;
};

type SentryStats = Awaited<ReturnType<typeof fetchSentryStats>>;

async function getHealth(): Promise<HealthPayload | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const cookie = h.get("cookie") ?? "";
    const res = await fetch(`${base}/api/health`, {
      cache: "no-store",
      headers: { cookie },
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthPayload;
  } catch {
    return null;
  }
}

async function fetchAuditEvents(): Promise<AuditEvent[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("audit_events")
      .select("ts, action, actor_email, target, detail")
      .order("ts", { ascending: false })
      .limit(50);
    return (data ?? []) as AuditEvent[];
  } catch {
    return [];
  }
}

async function fetchHeartbeatEvents(): Promise<HeartbeatEvent[]> {
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("db_heartbeat")
      .select("id, pinged_at")
      .order("pinged_at", { ascending: false })
      .limit(10);
    return (data ?? []) as HeartbeatEvent[];
  } catch {
    return [];
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
  const [healthResult, storageResult, sentryResult, auditResult, heartbeatResult] = await Promise.allSettled([
    getHealth(),
    getStorageUsageSummary(),
    fetchSentryStats(),
    fetchAuditEvents(),
    fetchHeartbeatEvents(),
  ]);

  const health = healthResult.status === "fulfilled" ? healthResult.value : null;
  const storage = storageResult.status === "fulfilled" ? storageResult.value : EMPTY_STORAGE;
  const sentry: SentryStats =
    sentryResult.status === "fulfilled" ? sentryResult.value : { available: false, error: "unavailable" };
  const auditEvents = auditResult.status === "fulfilled" ? auditResult.value : [];
  const heartbeatEvents = heartbeatResult.status === "fulfilled" ? heartbeatResult.value : [];

  const status: "ok" | "warn" | "degraded" | "unreachable" =
    (health?.status as any) ?? "unreachable";
  const env = (health?.checks?.env ?? {}) as Record<string, Record<string, boolean>>;
  const db =
    (health?.checks?.db as {
      ok: boolean;
      info?: string;
      tables?: { total: number; reachable: number; errors: string[] };
      heartbeat?: { ok: boolean; last_pinged_at: string | null; info: string | null };
    }) ?? { ok: false };
  const srv = serverInfo();

  const envGroups = [
    {
      name: "Clerk",
      checks: [
        { label: "Publishable Key", ok: !!env?.clerk?.publishable_key },
        { label: "Secret Key", ok: !!env?.clerk?.secret_key },
      ],
    },
    {
      name: "Supabase",
      checks: [
        { label: "URL", ok: !!env?.supabase?.url },
        { label: "Anon Key", ok: !!env?.supabase?.anon_key },
        { label: "Service Role Key", ok: !!env?.supabase?.service_role_key },
      ],
    },
    {
      name: "Sentry",
      checks: [
        { label: "DSN", ok: !!env?.sentry?.dsn },
        { label: "API Token", ok: !!env?.sentry?.api_token },
        { label: "Org Slug", ok: !!env?.sentry?.org_slug },
        { label: "Project Slug", ok: !!env?.sentry?.project_slug },
      ],
    },
    {
      name: "Upstash",
      checks: [
        { label: "Redis REST URL", ok: !!env?.upstash?.redis_rest_url },
        { label: "Redis REST Token", ok: !!env?.upstash?.redis_rest_token },
      ],
    },
  ];

  return (
    <RoleGate routeKey="monitoring">
      <section className="p-6 flex flex-col gap-6">
        {/* Health */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Health-Check</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">/api/health – Server &amp; DB</p>
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
                  <div className="grid gap-2">
                    {envGroups.map((group) => (
                      <EnvGroup key={group.name} name={group.name} checks={group.checks} />
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
                  {db.tables && (
                    <div className="text-[11px] text-zinc-400">
                      Tabellen erreichbar: {db.tables.reachable}/{db.tables.total}
                    </div>
                  )}
                  {db.tables?.errors?.length ? (
                    <div className="text-[11px] text-amber-300">
                      {db.tables.errors.join(" · ")}
                    </div>
                  ) : null}
                  {db.heartbeat && (
                    <div className="mt-2 text-[11px] text-zinc-400">
                      <span className="uppercase tracking-wide text-zinc-500">Heartbeat</span>:{" "}
                      <span className={db.heartbeat.ok ? "text-emerald-300" : "text-amber-300"}>
                        {db.heartbeat.info ?? "–"}
                      </span>{" "}
                      · Letzter Ping: {formatDate(db.heartbeat.last_pinged_at)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-400 uppercase tracking-wide">Server</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                  <div>Node</div>
                  <div className="text-zinc-200">{srv.node}</div>
                  <div>Env</div>
                  <div className="text-zinc-200">{srv.env}</div>
                  <div>Region</div>
                  <div className="text-zinc-200">{srv.region ?? "–"}</div>
                  <div>RSS</div>
                  <div className="text-zinc-200">{formatBytes(srv.rss)}</div>
                  <div>Heap</div>
                  <div className="text-zinc-200">{formatBytes(srv.heap)}</div>
                  <div>Uptime</div>
                  <div className="text-zinc-200">{health?.checks?.uptime_s ?? "–"}s</div>
                </div>

                <div className="mt-4 text-xs text-zinc-400 uppercase tracking-wide">Sentry</div>
                <div className="mt-1 grid gap-1 text-xs text-zinc-300">
                  <div>Events 24h: {sentry?.events24h ?? "—"}</div>
                  <div>Rejected 24h: {sentry?.rejected24h ?? "—"}</div>
                  <div>Unresolved Issues: {sentry?.unresolvedIssues ?? "—"}</div>
                  <div>Letztes Release: {sentry?.latestRelease ?? "—"}</div>
                  {!sentry?.available && (
                    <div className="text-[11px] text-amber-300">Sentry API nicht verfügbar oder nicht konfiguriert.</div>
                  )}
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

        {/* DB Keep-Alive */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">DB Keep-Alive</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Letzte 10 Pings aus <span className="font-mono">public.db_heartbeat</span>.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            {heartbeatEvents.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">Keine Heartbeats verfügbar.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Pinged At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {heartbeatEvents.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 text-zinc-300 text-xs">{entry.id}</td>
                      <td className="px-3 py-2 text-zinc-300 text-xs">{formatDate(entry.pinged_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Storage */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Speicher</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Dateien &amp; Freigaben (Supabase)</p>
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
        <AuditTable events={auditEvents} />
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
                  const allowed = roleLevels[r.name] ?? false;
                  return `${r.label}: ${allowed ? ACCESS_LABELS.allowed : ACCESS_LABELS.denied}`;
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

function AuditTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="card p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Letzte Ereignisse</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">Neueste 50 aus audit_events</p>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {events.length === 0 ? (
          <div className="p-4 text-sm text-zinc-400">Keine Audit-Einträge verfügbar.</div>
        ) : (
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
              {events.map((e, idx) => (
                <tr key={`${e.ts}-${idx}`}>
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
        )}
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

function EnvGroup({
  name,
  checks,
}: {
  name: string;
  checks: Array<{ label: string; ok: boolean }>;
}) {
  const allOk = checks.every((check) => check.ok);
  const cls = allOk
    ? "border-green-700 text-green-300 bg-green-900/20"
    : "border-amber-600 text-amber-300 bg-amber-900/20";

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
      <summary className="flex cursor-pointer items-center justify-between list-none">
        <div className="text-sm text-zinc-200">{name}</div>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${cls}`}>{allOk ? "OK" : "Fehlt"}</span>
          <span className="text-[11px] text-zinc-500">v</span>
        </div>
      </summary>
      <div className="mt-2 grid gap-1">
        {checks.map((check) => (
          <EnvRow key={`${name}-${check.label}`} label={check.label} ok={check.ok} />
        ))}
      </div>
    </details>
  );
}
