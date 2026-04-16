// src/app/settings/page.tsx
import RoleGate from "@/components/RoleGate";
import { getPermissionOverview } from "@/lib/access-db";
import { ACCESS_LABELS } from "@/lib/rbac";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const { roles, matrix } = await getPermissionOverview();

  return (
    <RoleGate routeKey="settings">
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <ShieldCheck size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Zugriff
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Zugriffsübersicht</span>
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Übersicht, welche Rollen aktuell Zugriff auf die einzelnen Tools haben. Änderungen können
              im Admin-Bereich unter „Berechtigungen" vorgenommen werden.
            </p>
          </div>
        </div>

        <div className="feature-card overflow-hidden p-0">

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y text-sm" style={{ borderColor: "hsl(var(--border))" }}>
              <thead style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Route</th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderColor: "hsl(var(--border))" }} className="divide-y divide-[hsl(var(--border))]">
                {Object.entries(matrix).map(([route, permissions]) => (
                  <tr key={route} className="hover:bg-[hsl(var(--secondary)/0.5)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>/{route}</td>
                    {roles.map((role) => {
                      const allowed = permissions[role.name] ?? false;
                      const label = allowed ? ACCESS_LABELS.allowed : ACCESS_LABELS.denied;
                      return (
                        <td key={role.id} className="px-4 py-2.5 text-xs" style={{ color: allowed ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.5)" }}>
                          {label}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
