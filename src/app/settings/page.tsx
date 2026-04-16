// src/app/settings/page.tsx
import RoleGate from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { ACCESS_LABELS } from "@/lib/rbac";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const { roles, matrix } = await getPermissionOverview();

  return (
    <RoleGate routeKey="settings">
      <section className="card p-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))] tracking-tight">Zugriffsübersicht</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Übersicht, welche Rollen aktuell Zugriff auf die einzelnen Tools haben. Änderungen können
            im Admin-Bereich unter „Berechtigungen" vorgenommen werden.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))] text-sm">
            <thead className="bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Route</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-4 py-2 text-left font-medium">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {Object.entries(matrix).map(([route, permissions]) => (
                <tr key={route} className="hover:bg-[hsl(var(--secondary))]">
                  <td className="px-4 py-2 text-[hsl(var(--foreground))] font-medium">/{route}</td>
                  {roles.map((role) => {
                    const allowed = permissions[role.name] ?? false;
                    const label = allowed ? ACCESS_LABELS.allowed : ACCESS_LABELS.denied;
                    const muted = allowed ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]";
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
