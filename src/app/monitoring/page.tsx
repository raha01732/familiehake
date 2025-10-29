import { RoleGate } from "@/components/RoleGate";
import { ACCESS_MAP } from "@/lib/access-map";

export const metadata = {
  title: "Monitoring | Private Tools"
};

const fakeStatus = [
  { name: "Authentifizierung", state: "OK", detail: "Login funktioniert" },
  { name: "Rollen-Check", state: "OK", detail: "Zugriffskontrolle aktiv" },
  { name: "Geschützte Bereiche", state: "OK", detail: "Alle Routen erreichbar" },
  { name: "Fehlversuche Login", state: "LOW", detail: "1 fehlgeschlagener Login (letzte 24h)" }
];

const fakeEvents = [
  { ts: "2025-10-29 18:40", msg: "Login success: ralf" },
  { ts: "2025-10-29 18:32", msg: "Access denied: user \"tim\" → /admin" },
  { ts: "2025-10-29 18:10", msg: "Rolle geändert: lisa → member" }
];

export default async function MonitoringPage() {
  return (
    <RoleGate routeKey="monitoring">
      <section className="grid gap-6">
        {/* Status-Karten */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Systemstatus
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Allgemeiner Zustand der Plattform.
              </p>
            </div>

            <ul className="grid gap-3 text-sm">
              {fakeStatus.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <div>
                    <div className="text-zinc-100 font-medium">
                      {item.name}
                    </div>
                    <div className="text-zinc-500 text-xs">
                      {item.detail}
                    </div>
                  </div>
                  <div className="text-right text-xs font-semibold px-2 py-1 rounded-lg border border-zinc-700 text-zinc-200">
                    {item.state}
                  </div>
                </li>
              ))}
            </ul>

            <div className="text-[11px] text-zinc-600">
              Stand: 29.10.2025
            </div>
          </div>

          <div className="card p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Module &amp; Berechtigungen
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Wer darf wohin?
              </p>
            </div>

            <div className="grid gap-3 text-sm">
              {Object.entries(ACCESS_MAP).map(([route, roles]) => (
                <div
                  key={route}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="mb-2 sm:mb-0">
                    <div className="text-zinc-100 font-medium text-sm">
                      /{route}
                    </div>
                    <div className="text-zinc-500 text-xs">
                      Sichtbar für: {roles.join(", ")}
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Status: aktiv
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Event-Log */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Letzte Ereignisse
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Jüngste sicherheitsrelevante Aktionen.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-medium">Zeit</th>
                  <th className="px-3 py-2 font-medium">Ereignis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {fakeEvents.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-zinc-300 text-xs whitespace-nowrap">
                      {row.ts}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">
                      {row.msg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-zinc-600">
            Hinweis: Daten aktuell statisch hinterlegt. Später hier echte Audit-Logs.
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
