import { RoleGate } from "@/components/RoleGate";

export const metadata = {
  title: "Dashboard | Private Tools"
};

export default async function DashboardPage() {
  return (
    <RoleGate routeKey="dashboard">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-zinc-100">
            Willkommen im Dashboard
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Überblick über interne Bereiche. Diese Seite ist für alle Mitglieder
            freigeschaltet.
          </p>
        </div>

        <div className="card p-6 flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-zinc-100">
            Nächste Schritte
          </h3>
          <ul className="text-zinc-400 text-sm leading-relaxed list-disc pl-4">
            <li>
              Neues Tool anlegen (neue Route unter{" "}
              <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">
                /src/app/&lt;tool&gt;/page.tsx
              </code>
              )
            </li>
            <li>
              In{" "}
              <code className="text-[11px] bg-zinc-800 px-1 py-0.5 rounded">
                ACCESS_MAP
              </code>{" "}
              Rolle zuweisen
            </li>
            <li>Deployen.</li>
          </ul>
        </div>
      </section>
    </RoleGate>
  );
}
