import { RoleGate } from "@/components/RoleGate";
import { currentUser } from "@clerk/nextjs/server";
import { logAudit } from "@/lib/audit";

export const metadata = { title: "Dashboard | Private Tools" };

export default async function DashboardPage() {
  // Login-Success (einfachheitshalber bei jedem Dashboard-Aufruf – später optional mit Cookie drosseln)
  const user = await currentUser();
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
      </section>
    </RoleGate>
  );
}
