import { RoleGate } from "@/components/RoleGate";
import { ACCESS_MAP } from "@/lib/access-map";

export const metadata = {
  title: "Settings | Private Tools"
};

export default async function SettingsPage() {
  return (
    <RoleGate routeKey="settings">
      <section className="card p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Sichtbarkeit der Bereiche
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Aktuelles Rollen-Mapping, fest im Code hinterlegt.
            Ziel: Später hier im UI bearbeitbar.
          </p>
        </div>

        <div className="grid gap-4">
          {Object.entries(ACCESS_MAP).map(([route, roles]) => (
            <div
              key={route}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="mb-2 sm:mb-0">
                <div className="text-zinc-100 font-medium text-sm">
                  /{route}
                </div>
                <div className="text-zinc-500 text-xs">
                  Sichtbar für: {roles.join(", ")}
                </div>
              </div>
              <button
                className="rounded-xl border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1.5 hover:bg-zinc-800/60"
              >
                Bearbeiten (später)
              </button>
            </div>
          ))}
        </div>
      </section>
    </RoleGate>
  );
}
