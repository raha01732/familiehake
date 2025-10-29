import { RoleGate } from "@/components/RoleGate";

export const metadata = {
  title: "Admin | Private Tools"
};

export default async function AdminPage() {
  return (
    <RoleGate routeKey="admin">
      <section className="card p-6 flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
          Admin Bereich
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Nur Nutzer mit{" "}
          <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">
            role = "admin"
          </code>
          .
        </p>

        <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40">
          <p className="text-zinc-300 text-sm font-medium">
            Geplante Admin-Funktionen:
          </p>
          <ul className="text-zinc-500 text-sm list-disc pl-4">
            <li>User-Management (Rollen ändern)</li>
            <li>Tool-Zugriffe konfigurieren</li>
            <li>System-Status / Monitoring</li>
          </ul>
        </div>
      </section>
    </RoleGate>
  );
}
