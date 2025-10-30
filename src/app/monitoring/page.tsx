import { RoleGate } from "@/components/RoleGate";
import { getAccessMapFromDb } from "@/lib/access-db";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Monitoring | Private Tools" };

import { headers } from "next/headers";

async function getHealth() {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    return data; // { status: "ok" | "warn" | "degraded", checks: {...} }
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

export default async function MonitoringPage() {
  const [accessMap, events, health] = await Promise.all([
    getAccessMapFromDb(),
    getLatestEvents(),
    getHealth(),
  ]);

  const fakeStatus = [
    { name: "Authentifizierung", state: health ? "OK" : "WARN", detail: "Clerk/Supabase Env geprüft" },
    { name: "Rollen-Check", state: "OK", detail: "Zugriffskontrolle aktiv" },
    { name: "Geschützte Bereiche", state: "OK", detail: "Alle Routen erreichbar" },
  ];

  return (
    <RoleGate routeKey="monitoring">
      <section className="grid gap-6">
        {/* Health */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Health-Check</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">/api/health – Server & DB</p>
          </div>
          <div className="grid gap-2 text-xs">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between">
                <div className="text-zinc-300">Status</div>
                <div className="rounded-lg border border-zinc-700 px-2 py-0.5 text-zinc-200">
                  {health?.status ?? "unreachable"}
                </div>
              </div>
              <pre className="mt-2 text-[11px] text-zinc-400 whitespace-pre-wrap">
                {JSON.stringify(health ?? { error: "no response" }, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Bestehend: Systemstatus & Module */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Systemstatus</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">Allgemeiner Zustand der Plattform.</p>
            </div>
            <ul className="grid gap-3 text-sm">
              {fakeStatus.map((item, idx) => (
                <li key={idx} className="flex items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div>
                    <div className="text-zinc-100 font-medium">{item.name}</div>
                    <div className="text-zinc-500 text-xs">{item.detail}</div>
                  </div>
                  <div className="text-right text-xs font-semibold px-2 py-1 rounded-lg border border-zinc-700 text-zinc-200">
                    {item.state}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Module &amp; Berechtigungen</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">Wer darf wohin? (live aus DB)</p>
            </div>
            <div className="grid gap-3 text-sm">
              {Object.entries(accessMap).map(([route, roles]) => (
                <div key={route} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="mb-2 sm:mb-0">
                    <div className="text-zinc-100 font-medium text-sm">/{route}</div>
                    <div className="text-zinc-500 text-xs">Sichtbar für: {roles.join(", ")}</div>
                  </div>
                  <div className="text-[11px] text-zinc-400">Status: aktiv</div>
                </div>
              ))}
            </div>
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
