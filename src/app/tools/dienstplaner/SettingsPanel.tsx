// src/app/tools/dienstplaner/SettingsPanel.tsx
import {
  createEmployeeAction,
  createPauseRuleAction,
  deleteEmployeeAction,
  deletePauseRuleAction,
  saveWeekdayRequirementAction,
  updateEmployeeAction,
  updatePauseRuleAction,
} from "./actions";

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

type WeekdayRequirement = {
  weekday: number;
  required_shifts: number;
};

const WEEKDAYS = [
  { id: 1, label: "Montag" },
  { id: 2, label: "Dienstag" },
  { id: 3, label: "Mittwoch" },
  { id: 4, label: "Donnerstag" },
  { id: 5, label: "Freitag" },
  { id: 6, label: "Samstag" },
  { id: 0, label: "Sonntag" },
];

type SettingsPanelProps = {
  employees: DienstplanEmployee[];
  pauseRules: PauseRule[];
  weekdayRequirements: WeekdayRequirement[];
  isAdmin: boolean;
};

export default function SettingsPanel({
  employees,
  pauseRules,
  weekdayRequirements,
  isAdmin,
}: SettingsPanelProps) {
  const weekdayMap = new Map<number, number>();
  for (const rule of weekdayRequirements) {
    weekdayMap.set(rule.weekday, rule.required_shifts);
  }

  const isReadOnly = !isAdmin;

  return (
    <div className="relative">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur p-6 flex flex-col gap-8 shadow-xl">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-zinc-100">Einstellungen</h2>
          <p className="text-xs text-zinc-500">
            Regeln und Stammdaten werden direkt hier gepflegt.
            {isReadOnly ? " (Nur Admins können speichern.)" : ""}
          </p>
        </header>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Mitarbeitende</h3>
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
              {employees.map((employee) => (
                <tr key={employee.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-2">
                    <form action={updateEmployeeAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={employee.id} />
                      <input
                        name="name"
                        defaultValue={employee.name}
                        className="bg-transparent text-zinc-100 w-full"
                        required
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400"
                        disabled={isReadOnly}
                      >
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
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400"
                        disabled={isReadOnly}
                      >
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
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400"
                        disabled={isReadOnly}
                      >
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
                      <button
                        type="submit"
                        className="text-xs text-amber-500 hover:text-amber-400"
                        disabled={isReadOnly}
                      >
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
              disabled={isReadOnly}
            />
            <input
              name="position"
              placeholder="Position"
              className="flex-1 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
              disabled={isReadOnly}
            />
            <input
              name="monthly_hours"
              type="number"
              step="0.1"
              placeholder="Std/Monat"
              className="w-28 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
              required
              disabled={isReadOnly}
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1 px-3 rounded"
              disabled={isReadOnly}
            >
              + Mitarbeiter
            </button>
          </form>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Schichtbedarf pro Wochentag</h3>
            <p className="text-xs text-zinc-500">
              Lege fest, wie viele Schichten standardmäßig pro Wochentag benötigt werden.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-300">
            {WEEKDAYS.map((weekday) => (
              <form key={weekday.id} action={saveWeekdayRequirementAction} className="flex items-center gap-3">
                <input type="hidden" name="weekday" value={weekday.id} />
                <span className="w-28 text-zinc-200">{weekday.label}</span>
                <input
                  name="required_shifts"
                  type="number"
                  min="0"
                  defaultValue={weekdayMap.get(weekday.id) ?? 0}
                  className="w-20 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
                  disabled={isReadOnly}
                />
                <button
                  type="submit"
                  className="text-xs text-emerald-500 hover:text-emerald-400"
                  disabled={isReadOnly}
                >
                  Speichern
                </button>
              </form>
            ))}
          </div>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Pausenregeln</h3>
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
              {pauseRules.map((rule) => (
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
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400"
                        disabled={isReadOnly}
                      >
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
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400"
                        disabled={isReadOnly}
                      >
                        Speichern
                      </button>
                    </form>
                  </td>
                  <td className="py-2 text-right">
                    <form action={deletePauseRuleAction}>
                      <input type="hidden" name="id" value={rule.id} />
                      <button
                        type="submit"
                        className="text-xs text-amber-500 hover:text-amber-400"
                        disabled={isReadOnly}
                      >
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
              disabled={isReadOnly}
            />
            <input
              name="pause_minutes"
              type="number"
              placeholder="Pause (Min)"
              className="w-32 bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 px-2 py-1"
              required
              disabled={isReadOnly}
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1 px-3 rounded"
              disabled={isReadOnly}
            >
              + Regel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
