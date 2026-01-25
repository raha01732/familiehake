// src/app/tools/dienstplaner/settings/page.tsx
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createEmployeeAction,
  createPauseRuleAction,
  deleteEmployeeAction,
  deletePauseRuleAction,
  updateEmployeeAction,
  updatePauseRuleAction,
} from "../actions";

export const metadata = { title: "Dienstplaner Einstellungen" };

type DienstplanEmployee = {
  id: number;
  name: string;
  position: string | null;
  monthly_hours: number;
  user_id: string | null;
};

type PauseRule = {
  id: number;
  min_minutes: number;
  pause_minutes: number;
};

export default async function DienstplanerSettingsPage() {
  const user = await currentUser();
  if (!user) {
    return <section className="p-6 text-zinc-400">Bitte melde dich an, um die Einstellungen zu sehen.</section>;
  }

  const sb = createAdminClient();
  const { data: employees } = await sb.from("dienstplan_employees").select("*").order("name");
  const { data: pauseRules } = await sb
    .from("dienstplan_pause_rules")
    .select("id, min_minutes, pause_minutes")
    .order("min_minutes");

  return (
    <section className="p-6 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Dienstplaner Einstellungen</h1>
            <p className="text-sm text-zinc-400">Stamm- und Pausenregeln für den Planer.</p>
          </div>
          <Link href="/tools/dienstplaner" className="text-sm text-zinc-300 underline">
            Zurück zur Planung
          </Link>
        </div>
      </header>

      <div className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Mitarbeitende</h2>
          <p className="text-xs text-zinc-500">
            Benutzerverknüpfungen sind vorbereitet, aber noch deaktiviert. In späteren Versionen kannst du hier Tool-Nutzer auswählen.
          </p>
        </div>
        <table className="w-full text-sm text-zinc-300">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left py-2">Name</th>
              <th className="text-left py-2">Position</th>
              <th className="text-right py-2">Soll Stunden/Monat</th>
              <th className="text-left py-2">Tool-Benutzer</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(employees as DienstplanEmployee[] | null)?.map((employee) => (
              <tr key={employee.id} className="border-t border-zinc-800">
                <td className="py-2 pr-2">
                  <form action={updateEmployeeAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <input
                      name="name"
                      defaultValue={employee.name}
                      className="bg-transparent text-zinc-100 w-full"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-2 pr-2">
                  <form action={updateEmployeeAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <input
                      name="position"
                      defaultValue={employee.position ?? ""}
                      className="bg-transparent text-zinc-100 w-full"
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-2 pr-2 text-right">
                  <form action={updateEmployeeAction} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <input
                      name="monthly_hours"
                      type="number"
                      step="0.1"
                      defaultValue={employee.monthly_hours}
                      className="bg-transparent text-zinc-100 w-20 text-right"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-2 pr-2">
                  <input
                    disabled
                    value={employee.user_id ?? "(noch nicht verknüpft)"}
                    className="bg-zinc-900/50 border border-zinc-800 text-zinc-500 text-xs px-2 py-1 rounded w-full"
                  />
                </td>
                <td className="py-2 text-right">
                  <form action={deleteEmployeeAction}>
                    <input type="hidden" name="id" value={employee.id} />
                    <button type="submit" className="text-xs text-amber-500 hover:text-amber-400">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form action={createEmployeeAction} className="flex flex-wrap items-center gap-3">
          <input
            name="name"
            placeholder="Name"
            className="flex-1 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <input
            name="position"
            placeholder="Position"
            className="flex-1 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
          />
          <input
            name="monthly_hours"
            type="number"
            step="0.1"
            placeholder="Std/Monat"
            className="w-28 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1 px-3 rounded"
          >
            + Mitarbeiter
          </button>
        </form>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Pausenregeln</h2>
          <p className="text-xs text-zinc-500">
            Hinterlege, ab welcher Schichtdauer wie viele Minuten Pause automatisch abgezogen werden.
          </p>
        </div>
        <table className="w-full text-sm text-zinc-300">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left py-2">Ab Minuten</th>
              <th className="text-left py-2">Pausenminuten</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(pauseRules as PauseRule[] | null)?.map((rule) => (
              <tr key={rule.id} className="border-t border-zinc-800">
                <td className="py-2 pr-2">
                  <form action={updatePauseRuleAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={rule.id} />
                    <input
                      name="min_minutes"
                      type="number"
                      defaultValue={rule.min_minutes}
                      className="bg-transparent text-zinc-100 w-24"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-2 pr-2">
                  <form action={updatePauseRuleAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={rule.id} />
                    <input
                      name="pause_minutes"
                      type="number"
                      defaultValue={rule.pause_minutes}
                      className="bg-transparent text-zinc-100 w-24"
                      required
                    />
                    <button type="submit" className="text-xs text-emerald-500 hover:text-emerald-400">
                      Speichern
                    </button>
                  </form>
                </td>
                <td className="py-2 text-right">
                  <form action={deletePauseRuleAction}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button type="submit" className="text-xs text-amber-500 hover:text-amber-400">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form action={createPauseRuleAction} className="flex flex-wrap items-center gap-3">
          <input
            name="min_minutes"
            type="number"
            placeholder="Ab Minuten"
            className="w-32 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <input
            name="pause_minutes"
            type="number"
            placeholder="Pause (Min)"
            className="w-32 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
            required
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1 px-3 rounded"
          >
            + Regel
          </button>
        </form>
      </div>
    </section>
  );
}
