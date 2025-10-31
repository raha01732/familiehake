import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { getStorageUsageSummary } from "@/lib/stats";

export const metadata = { title: "Storage-Insights" };

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

export default async function StorageInsightsPage() {
  const summary = await getStorageUsageSummary();

  return (
    <RoleGate routeKey="tools/storage">
      <section className="grid gap-6">
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Storage-Insights</h1>
              <p className="text-sm text-zinc-400">
                Ein Blick wie im Nextcloud-Admin-Dashboard: Speicherverbrauch, Freigaben und schnell erreichbare Aktionen.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/tools/files"
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800/60"
              >
                Dateimanager
              </Link>
              <Link
                href="/tools/files/trash"
                className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800/60"
              >
                Papierkorb
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Aktive Dateien</div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.totalFiles.toLocaleString()}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{formatBytes(summary.totalBytes)}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Papierkorb</div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.trashedFiles.toLocaleString()}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{formatBytes(summary.trashedBytes)}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Aktive Freigaben</div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.activeShares.toLocaleString()}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{summary.expiringSoon} laufen in &lt;48h ab</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Beendete Freigaben</div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.revokedShares + summary.expiredShares}</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {summary.revokedShares} widerrufen · {summary.expiredShares} abgelaufen
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Aktuelle Freigaben</h2>
            <p className="text-xs text-zinc-500">
              Die letzten 20 Freigaben inkl. Status – nutze sie wie die Nextcloud-Linkübersicht.
            </p>
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
                {summary.recentShares.map((share) => (
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
                {summary.recentShares.length === 0 && (
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
      </section>
    </RoleGate>
  );
}
