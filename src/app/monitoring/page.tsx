/**src/app/monitoring/page.tsx**/

import { RoleGate } from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { PERMISSION_LABELS, PERMISSION_LEVELS } from "@/lib/rbac";
import { fetchSentryStats } from "@/lib/sentry-metrics";
import { getStorageUsageSummary } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "System Monitoring" };

export default async function MonitoringPage() {
  const sb = createClient();
  const user = await currentUser();

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function getServerInfo() {
  const memory = typeof process.memoryUsage === "function" ? process.memoryUsage() : null;
  return {
    node: process.version,
    platform: process.platform,
    release: process.release?.name ?? "node",
    uptimeSeconds: typeof process.uptime === "function" ? Math.round(process.uptime()) : null,
    rss: memory?.rss ?? null,
    heapUsed: memory?.heapUsed ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    region: process.env.VERCEL_REGION ?? null,
  };
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function getServerInfo() {
  const memory = typeof process.memoryUsage === "function" ? process.memoryUsage() : null;
  return {
    node: process.version,
    platform: process.platform,
    release: process.release?.name ?? "node",
    uptimeSeconds: typeof process.uptime === "function" ? Math.round(process.uptime()) : null,
    rss: memory?.rss ?? null,
    heapUsed: memory?.heapUsed ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    region: process.env.VERCEL_REGION ?? null,
  };
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
  const [{ roles, matrix }, events, health, storageSummary, sentryStats] = await Promise.all([
    getPermissionOverview(),
    getLatestEvents(),
    getHealth(),
    getStorageUsageSummary(),
    fetchSentryStats(),
  ]);

  const status: "ok" | "warn" | "degraded" | "unreachable" = (health?.status as any) ?? "unreachable";
  const uptime = health?.checks?.uptime_s ?? null;
  const env = (health?.checks?.env as Record<string, boolean>) ?? {};
  const db = (health?.checks?.db as { ok: boolean; info?: string }) ?? { ok: false, info: "no data" };
  const serverInfo = getServerInfo();

  // Reihenfolge & Labels der ENV-Checks hübsch definieren
  const envOrder: Array<[keyof typeof env, string]> = [
    ["clerk_publishable", "Clerk Publishable Key"],
    ["clerk_secret", "Clerk Secret Key"],
    ["supabase_url", "Supabase URL"],
    ["supabase_anon", "Supabase Anon Key"],
    ["supabase_service", "Supabase Service Key"],
    ["sentry_dsn", "Sentry DSN (optional)"],
  ].filter(([k]) => k in env) as any;
  const envChecks = envOrder.map(([key, label]) => ({
    key: String(key),
    label,
    ok: !!env[key],
  }));

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

            {/* ENV-Übersicht (Kurz) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-sm text-zinc-200 mb-2">Environment</div>
              <div className="grid gap-2">
                {envChecks.map(({ key, label, ok }) => (
                  <BoolPill key={key} ok={ok} label={label} />
                ))}
                {envChecks.length === 0 && (
                  <div className="text-[11px] text-zinc-500">Keine ENV-Daten.</div>
                )}
              </div>

          {/* Optional: Vollständige JSON-Rohdaten ein/ausblendbar */}
          <details className="mt-2">
            <summary className="text-xs text-zinc-500 cursor-pointer">Rohdaten anzeigen</summary>
            <pre className="mt-2 text-[11px] text-zinc-400 whitespace-pre-wrap">
              {JSON.stringify(health ?? { status: "unreachable", checks: {} }, null, 2)}
            </pre>
          </details>
        </div>

        {/* Observability */}
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Observability &amp; Alerts</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Direkte Telemetrie aus Sentry – ähnlich dem Nextcloud-"Überwachung"-Panel.
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              {sentryStats.available ? "online" : "keine API"}
            </div>
          </div>

          {sentryStats.available ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Events (24h)</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {sentryStats.events24h?.toLocaleString() ?? "0"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Rejected</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {sentryStats.rejected24h?.toLocaleString() ?? "0"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Rate-Limits / DSN-Fehler</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Offene Issues</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {sentryStats.unresolvedIssues?.toLocaleString() ?? "0"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {sentryStats.latestIssueTitle ? `Neu: ${sentryStats.latestIssueTitle}` : "Keine neuen Fehler"}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Letztes Release</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {sentryStats.latestRelease ?? "–"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">Sentry Release Feed</div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-700 bg-amber-900/20 p-4 text-sm text-amber-100">
              Keine Sentry-API-Konfiguration hinterlegt. Hinterlege <code>SENTRY_API_TOKEN</code>,{" "}
              <code>SENTRY_ORG_SLUG</code>{" "}und{" "}
              <code>SENTRY_PROJECT_SLUG</code>, um Live-Metriken zu sehen.
            </div>
          )}
        </div>

        {/* Serverinformationen */}
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Server &amp; Runtime</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Technische Details der laufenden Instanz – entspricht dem Nextcloud-Systembericht.
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500">{serverInfo.environment}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Node</div>
              <div className="text-2xl font-semibold text-zinc-100">{serverInfo.node}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{serverInfo.release}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Platform</div>
              <div className="text-2xl font-semibold text-zinc-100">{serverInfo.platform}</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Region: {serverInfo.region ?? "n/a"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Uptime</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {serverInfo.uptimeSeconds != null ? `${serverInfo.uptimeSeconds}s` : "–"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">lokaler Prozess</div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">RSS</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {serverInfo.rss != null ? formatBytes(serverInfo.rss) : "–"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Belegter Arbeitsspeicher</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Heap Used</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {serverInfo.heapUsed != null ? formatBytes(serverInfo.heapUsed) : "–"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">V8 Heap</div>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Dateispeicher &amp; Freigaben</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Aggregierte Statistiken aus dem Files-Modul – damit du die Nextcloud-Auslastung im Blick behältst.
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              {storageSummary.totalFiles.toLocaleString()} Dateien
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Aktiver Speicher</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {formatBytes(storageSummary.totalBytes)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">{storageSummary.totalFiles} Dateien</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Papierkorb</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {formatBytes(storageSummary.trashedBytes)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">{storageSummary.trashedFiles} Elemente</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Freigaben aktiv</div>
              <div className="text-2xl font-semibold text-zinc-100">{storageSummary.activeShares}</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {storageSummary.expiringSoon} laufen in &lt;48h ab
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Freigaben beendet</div>
              <div className="text-2xl font-semibold text-zinc-100">{storageSummary.revokedShares + storageSummary.expiredShares}</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {storageSummary.revokedShares} widerrufen · {storageSummary.expiredShares} abgelaufen
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-medium">Freigabe</th>
                  <th className="px-3 py-2 font-medium">Datei</th>
                  <th className="px-3 py-2 font-medium">Erstellt</th>
                  <th className="px-3 py-2 font-medium">Ablauf</th>
                  <th className="px-3 py-2 font-medium">Downloads</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {storageSummary.recentShares.slice(0, 8).map((share) => (
                  <tr key={share.id}>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{share.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2 text-zinc-300 text-xs">{share.fileName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px]">{formatDate(share.createdAt)}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px]">{formatDate(share.expiresAt)}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">
                      {share.downloads}
                      {share.maxDownloads ? ` / ${share.maxDownloads}` : ""}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-300 capitalize">{share.state}</td>
                  </tr>
                ))}
                {storageSummary.recentShares.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-xs text-zinc-500">
                      Keine Freigaben vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Module & Berechtigungen (aus DB) */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Module &amp; Berechtigungen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Wer darf wohin? (live aus DB)</p>
          </div>
          <div className="grid gap-3 text-sm">
            {Object.entries(matrix)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([route, roleLevels]) => (
              <div
                key={route}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="mb-2 sm:mb-0">
                  <div className="text-zinc-100 font-medium text-sm">/{route}</div>
                  <div className="text-zinc-500 text-xs">
                    {roles
                      .map((role) => {
                        const level = roleLevels[role.name] ?? PERMISSION_LEVELS.NONE;
                        return `${role.label}: ${PERMISSION_LABELS[level]}`;
                      })
                      .join(" • ")}
                  </div>
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
