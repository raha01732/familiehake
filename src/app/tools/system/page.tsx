import RoleGate from "@/components/RoleGate";
import { env } from "@/lib/env";
import { fetchSentryStats } from "@/lib/sentry-metrics";
import { headers } from "next/headers";

export const metadata = { title: "Systemübersicht" };

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

function formatBytes(bytes: number | null) {
  if (!bytes) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function mask(value: string | null | undefined, keep = 4) {
  if (!value) return "–";
  if (value.length <= keep) return value;
  return `${value.slice(0, keep)}…${value.slice(-2)}`;
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

export default async function SystemOverviewPage() {
  const [health, sentry] = await Promise.all([getHealth(), fetchSentryStats()]);
  const server = getServerInfo();
  const configuration = env();

  const envOverview = [
    { label: "NEXT_PUBLIC_APP_URL", value: configuration.NEXT_PUBLIC_APP_URL },
    { label: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", value: mask(configuration.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) },
    { label: "CLERK_SECRET_KEY", value: mask(configuration.CLERK_SECRET_KEY) },
    { label: "NEXT_PUBLIC_SUPABASE_URL", value: configuration.NEXT_PUBLIC_SUPABASE_URL },
    { label: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: mask(configuration.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { label: "SUPABASE_SERVICE_ROLE_KEY", value: mask(configuration.SUPABASE_SERVICE_ROLE_KEY) },
    { label: "SENTRY_DSN", value: configuration.SENTRY_DSN ? mask(configuration.SENTRY_DSN) : "–" },
    { label: "SENTRY_API_TOKEN", value: configuration.SENTRY_API_TOKEN ? mask(configuration.SENTRY_API_TOKEN) : "–" },
    { label: "SENTRY_PROJECT", value: configuration.SENTRY_PROJECT_SLUG ?? "–" },
  ];

  const status: "ok" | "warn" | "degraded" | "unreachable" = (health?.status as any) ?? "unreachable";

  return (
    <RoleGate routeKey="tools/system">
      <section className="grid gap-6">
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Systemübersicht</h1>
              <p className="text-sm text-zinc-400">
                Verdichtete Runtime-Daten – inspiriert vom Nextcloud-Systembericht.
              </p>
            </div>
            <div className="text-xs text-zinc-500">Status: {status}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Node</div>
              <div className="text-2xl font-semibold text-zinc-100">{server.node}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{server.release}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Platform</div>
              <div className="text-2xl font-semibold text-zinc-100">{server.platform}</div>
              <div className="text-[11px] text-zinc-500 mt-1">Region: {server.region ?? "n/a"}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Uptime</div>
              <div className="text-2xl font-semibold text-zinc-100">
                {server.uptimeSeconds != null ? `${server.uptimeSeconds}s` : "–"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Prozesslaufzeit</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Speicher</div>
              <div className="text-2xl font-semibold text-zinc-100">{formatBytes(server.rss)}</div>
              <div className="text-[11px] text-zinc-500 mt-1">Heap: {formatBytes(server.heapUsed)}</div>
            </div>
          </div>
        </div>

        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Konfiguration</h2>
            <p className="text-xs text-zinc-500">Maskierte Secrets und öffentlich sichtbare URLs.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {envOverview.map((entry) => (
              <div key={entry.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">{entry.label}</div>
                <div className="text-sm text-zinc-200 break-all">{entry.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Sentry Status</h2>
              <p className="text-xs text-zinc-500">
                Schneller Überblick über Error-Monitoring und Releases.
              </p>
            </div>
            <div className="text-xs text-zinc-500">{sentry.available ? "verbunden" : "nicht konfiguriert"}</div>
          </div>
          {sentry.available ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Events (24h)</div>
                <div className="text-2xl font-semibold text-zinc-100">{sentry.events24h?.toLocaleString() ?? "0"}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Rejected</div>
                <div className="text-2xl font-semibold text-zinc-100">{sentry.rejected24h?.toLocaleString() ?? "0"}</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Letztes Release</div>
                <div className="text-2xl font-semibold text-zinc-100">{sentry.latestRelease ?? "–"}</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {sentry.latestIssueTitle ? `Neuester Fehler: ${sentry.latestIssueTitle}` : "Keine neuen Fehler"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-700 bg-amber-900/20 p-4 text-sm text-amber-100">
              Sentry-API nicht aktiv. Hinterlege Token und Projekt-Slugs, um Metriken zu sehen.
            </div>
          )}
        </div>
      </section>
    </RoleGate>
  );
}
