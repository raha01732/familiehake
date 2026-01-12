// src/app/dashboard/page.tsx
import RoleGate from "@/components/RoleGate";
import { currentUser } from "@clerk/nextjs/server";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata = { title: "Dashboard | Private Tools" };

type HealthSummary = {
  status: "ok" | "warn" | "degraded";
};

async function getHealthSummary(): Promise<HealthSummary | null> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) return null;
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthSummary;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  // Login-Success (einfachheitshalber bei jedem Dashboard-Aufruf – später optional mit Cookie drosseln)
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);
  const health = isAdmin ? await getHealthSummary() : null;
  const healthStatus = (health?.status as "ok" | "warn" | "degraded" | "unreachable") ?? "unreachable";
  const healthLabel = healthStatus === "ok" ? "Keine Fehler" : "Fehler erkannt";
  if (user) {
    await logAudit({
      action: "login_success",
      actorUserId: user.id,
      actorEmail: user.emailAddresses?.[0]?.emailAddress ?? null,
      target: "/dashboard",
      detail: null
    });
  }

  return (
    <RoleGate routeKey="dashboard">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-zinc-100">Willkommen im Dashboard</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Überblick über interne Bereiche. Diese Seite ist für alle Mitglieder freigeschaltet.
          </p>
        </div>
        <div className="card p-6 flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-zinc-100">Nächste Schritte</h3>
          <ul className="text-zinc-400 text-sm leading-relaxed list-disc pl-4">
            <li>Neue Route unter <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">/src/app/&lt;tool&gt;/page.tsx</code> anlegen</li>
            <li>In <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">tools_access</code> Rollen pflegen</li>
            <li>Deployen.</li>
          </ul>
        </div>
        {isAdmin ? (
          <div className="card p-6 flex flex-col gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">System-Health</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Kurzüberblick aus dem Monitoring – nur für Admins.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-sm text-zinc-200">Status</div>
              <span
                className={`rounded-lg border px-2 py-0.5 text-xs ${
                  healthStatus === "ok"
                    ? "border-green-700 text-green-300 bg-green-900/20"
                    : "border-amber-600 text-amber-300 bg-amber-900/20"
                }`}
              >
                {healthLabel}
              </span>
            </div>
            <Link
              href="/monitoring"
              className="text-sm text-zinc-200 hover:text-white underline underline-offset-4"
            >
              Zum Monitoring →
            </Link>
          </div>
        ) : null}
      </section>
    </RoleGate>
  );
}
