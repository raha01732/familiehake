import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { getJournalSummary, getStorageUsageSummary } from "@/lib/stats";
import { getSessionInfo } from "@/lib/auth";
import { PERMISSION_LEVELS } from "@/lib/rbac";

export const metadata = { title: "Tools" };

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(value: string | null) {
  if (!value) return "–";
  return new Date(value).toLocaleString();
}

export default async function ToolsIndexPage() {
  const session = await getSessionInfo();
  const [storage, journal] = await Promise.all([
    getStorageUsageSummary(),
    getJournalSummary(),
  ]);

  const canSee = (route: string, minimum = PERMISSION_LEVELS.READ) => {
    if (!session.signedIn) return false;
    if (session.isSuperAdmin) return true;
    return (session.permissions[route] ?? PERMISSION_LEVELS.NONE) >= minimum;
  };

  return (
    <RoleGate routeKey="tools">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Werkzeuge</h1>
          <p className="text-sm text-zinc-400">
            Sammelstelle aller Module – angelehnt an das Nextcloud-App-Grid, mit Kennzahlen aus deinen Daten.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {canSee("tools/files", PERMISSION_LEVELS.READ) && (
            <Link
            href="/tools/files"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:bg-zinc-900/60 transition flex flex-col gap-2"
          >
            <div className="text-zinc-100 font-medium">Dateien</div>
            <div className="text-xs text-zinc-500">{storage.totalFiles.toLocaleString()} Dateien · {formatBytes(storage.totalBytes)}</div>
            <p className="text-[11px] text-zinc-500">
              Browserbasierter Speicher inklusive Freigaben &amp; Papierkorb – dein privates Nextcloud-Drive.
            </p>
          </Link>
          )}

          {canSee("tools/journal", PERMISSION_LEVELS.READ) && (
            <Link
            href="/tools/journal"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:bg-zinc-900/60 transition flex flex-col gap-2"
          >
            <div className="text-zinc-100 font-medium">Journal</div>
            <div className="text-xs text-zinc-500">{journal.totalEntries.toLocaleString()} Einträge</div>
            <p className="text-[11px] text-zinc-500">Letzte Aktualisierung: {formatDate(journal.lastUpdatedAt)}</p>
          </Link>
          )}

          {canSee("tools/storage", PERMISSION_LEVELS.READ) && (
            <Link
            href="/tools/storage"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:bg-zinc-900/60 transition flex flex-col gap-2"
          >
            <div className="text-zinc-100 font-medium">Storage-Insights</div>
            <div className="text-xs text-zinc-500">{storage.activeShares} aktive Freigaben</div>
            <p className="text-[11px] text-zinc-500">
              Ausführliche Statistiken zu Speicher, Freigaben und Auslastung – wie der Nextcloud Admin-Report.
            </p>
          </Link>
          )}

          {canSee("tools/system", PERMISSION_LEVELS.READ) && (
            <Link
            href="/tools/system"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:bg-zinc-900/60 transition flex flex-col gap-2"
          >
            <div className="text-zinc-100 font-medium">Systemübersicht</div>
            <div className="text-xs text-zinc-500">Runtime, Speicher &amp; Regionen</div>
            <p className="text-[11px] text-zinc-500">
              Konsolidierte Serverdaten, damit du Deployments und Infrastruktur im Blick behältst.
            </p>
          </Link>
          )}

          {canSee("monitoring", PERMISSION_LEVELS.READ) && (
            <Link
            href="/monitoring"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:bg-zinc-900/60 transition flex flex-col gap-2"
          >
            <div className="text-zinc-100 font-medium">Monitoring</div>
            <div className="text-xs text-zinc-500">Sentry, Health &amp; Audit-Logs</div>
            <p className="text-[11px] text-zinc-500">
              Für schnelle Fehleranalysen direkt aus den Tools erreichbar.
            </p>
          </Link>
          )}
        </div>
      </section>
    </RoleGate>
  );
}
