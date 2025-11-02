import RoleGate from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { PERMISSION_LABELS, PERMISSION_LEVELS } from "@/lib/rbac";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const { roles, matrix } = await getPermissionOverview();

  return (
    <RoleGate routeKey="settings" minLevel={PERMISSION_LEVELS.READ}>
      <section className="card p-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Zugriffsübersicht</h1>
          <p className="text-sm text-zinc-400">
            Übersicht, welche Rollen aktuell Zugriff auf die einzelnen Tools haben. Änderungen können
            im Admin-Bereich unter „Berechtigungen" vorgenommen werden.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full border border-zinc-800 divide-y divide-zinc-800 text-sm">
            <thead className="bg-zinc-900/60 text-zinc-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Route</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-4 py-2 text-left font-medium">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {Object.entries(matrix).map(([route, permissions]) => (
                <tr key={route} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-2 text-zinc-300 font-medium">/{route}</td>
                  {roles.map((role) => {
                    const level = permissions[role.name] ?? PERMISSION_LEVELS.NONE;
                    const label = PERMISSION_LABELS[level];
                    const muted = level === PERMISSION_LEVELS.NONE ? "text-zinc-600" : "text-zinc-100";
                    return (
                      <td key={role.id} className={`px-4 py-2 ${muted}`}>
                        {label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  );
}
