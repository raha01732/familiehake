// /workspace/familiehake/src/app/tools/dienstplaner/SettingsPanel.tsx
import {
  createPauseRuleAction,
  deletePauseRuleAction,
  saveEmploymentHourDefaultAction,
  savePlanningRulesAction,
  updatePauseRuleAction,
} from "./actions";
import ShiftRulesEditor from "./ShiftRulesEditor";
import PeriodsEditor from "./PeriodsEditor";
import type { RulePeriod, ShiftRule } from "./requirements";
import FormFeedback from "./components/FormFeedback";
import { EMPLOYMENT_TYPES } from "./utils";
import type { PlanningRules } from "@/lib/dienstplaner/planning-rules";

type PauseRule = {
  id: number;
  min_minutes: number;
  pause_minutes: number;
};

type EmploymentHourDefaultRow = {
  employment_type: string;
  vacation_hours_per_day: number;
};

export type EditableUser = {
  id: string;
  displayName: string;
  isEditor: boolean;
};

type SettingsPanelProps = {
  pauseRules: PauseRule[];
  shiftRules: ShiftRule[];
  rulePeriods: RulePeriod[];
  periodsAvailable: boolean;
  employmentHourDefaults: EmploymentHourDefaultRow[];
  planningRules: PlanningRules;
  editableUsers: EditableUser[];
  setDienstplanEditorAction: (_fd: FormData) => Promise<void>;
  isAdmin: boolean;
};

export default function SettingsPanel({
  pauseRules,
  shiftRules,
  rulePeriods,
  periodsAvailable,
  employmentHourDefaults,
  planningRules,
  editableUsers,
  setDienstplanEditorAction,
  isAdmin,
}: SettingsPanelProps) {
  const hourDefaultByType = new Map(
    employmentHourDefaults.map((d) => [d.employment_type, Number(d.vacation_hours_per_day) || 0])
  );
  const isReadOnly = !isAdmin;
  const inputBase =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";
  return (
    <div className="relative">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] backdrop-blur p-6 flex flex-col gap-8 shadow-xl">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Einstellungen</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Schichtanforderungen, Planungsregeln und Pausenregeln werden direkt hier gepflegt.
            {isReadOnly ? " (Nur Admins können speichern.)" : ""}
          </p>
        </header>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Bearbeitungsrechte für Verfügbarkeiten
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Admins dürfen Verfügbarkeiten (Frei/Urlaub/Krank/feste Zeiten) im Dienstplaner
              immer bearbeiten. Hier legst du fest, welche einzelnen Nicht-Admin-Benutzer mit
              Zugriff auf den Kino-Bereich zusätzlich eintragen dürfen.
            </p>
          </div>
          {editableUsers.length === 0 ? (
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {isReadOnly
                ? "Nur Admins können Bearbeitungsrechte vergeben."
                : "Keine Nicht-Admin-Benutzer mit Zugriff auf den Kino-Bereich gefunden."}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {editableUsers.map((editableUser) => (
                <div
                  key={editableUser.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-2"
                >
                  <span className="text-sm text-[hsl(var(--foreground))]">{editableUser.displayName}</span>
                  <FormFeedback
                    action={setDienstplanEditorAction}
                    successText={editableUser.isEditor ? "Zugriff entzogen" : "Zugriff erteilt"}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="user_id" value={editableUser.id} />
                    <input type="hidden" name="enabled" value={editableUser.isEditor ? "false" : "true"} />
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        editableUser.isEditor
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                      }`}
                    >
                      {editableUser.isEditor ? "darf bearbeiten" : "kein Zugriff"}
                    </span>
                    <button
                      type="submit"
                      className="text-xs text-emerald-500 hover:text-emerald-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isReadOnly}
                    >
                      {editableUser.isEditor ? "Entziehen" : "Freischalten"}
                    </button>
                  </FormFeedback>
                </div>
              ))}
            </div>
          )}
        </div>

        <ShiftRulesEditor rules={shiftRules} isReadOnly={isReadOnly} />

        <PeriodsEditor
          periods={rulePeriods}
          rules={shiftRules}
          isReadOnly={isReadOnly}
          available={periodsAvailable}
        />

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Urlaubsstunden je Beschäftigungstyp
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Wieviele Stunden pro Urlaubstag werden dem Soll angerechnet? Gilt für die Ist-Berechnung im
              Monatsplan, im Mitarbeiter-Modal und für die Fairness-Bewertung im Auto- bzw. KI-Plan.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {EMPLOYMENT_TYPES.map((type) => (
              <FormFeedback
                key={type.value}
                action={saveEmploymentHourDefaultAction}
                className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-2"
              >
                <input type="hidden" name="employment_type" value={type.value} />
                <span className="w-32 text-sm text-[hsl(var(--foreground))]">{type.label}</span>
                <input
                  name="vacation_hours_per_day"
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  defaultValue={hourDefaultByType.get(type.value) ?? 0}
                  className={`${inputBase} w-24 px-2 py-1`}
                  disabled={isReadOnly}
                />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">h / Urlaubstag</span>
                <button
                  type="submit"
                  className="ml-auto text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                  disabled={isReadOnly}
                >
                  Speichern
                </button>
              </FormFeedback>
            ))}
          </div>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Planungsregeln (Auto-Plan)</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Harte Grenzen, die der Auto-Plan nie überschreitet. Im Monatsplan lassen sie sich pro Lauf
              überschreiben; hier steht der Standard für alle.
            </p>
          </div>
          <FormFeedback action={savePlanningRulesAction} className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              Max. Schichten pro Woche
              <input
                name="max_shifts_per_week"
                type="number"
                min={1}
                max={7}
                step={1}
                defaultValue={planningRules.max_shifts_per_week}
                className={`${inputBase} w-28 px-2 py-1`}
                disabled={isReadOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              Mindest-Ruhezeit (Stunden)
              <input
                name="min_rest_hours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                defaultValue={planningRules.min_rest_hours}
                className={`${inputBase} w-28 px-2 py-1`}
                disabled={isReadOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              Max. Arbeitstage in Folge
              <input
                name="max_consecutive_days"
                type="number"
                min={1}
                max={14}
                step={1}
                defaultValue={planningRules.max_consecutive_days}
                className={`${inputBase} w-28 px-2 py-1`}
                disabled={isReadOnly}
              />
            </label>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg disabled:opacity-50"
              disabled={isReadOnly}
            >
              Speichern
            </button>
          </FormFeedback>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Pausenregeln</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Hinterlege, ab welcher Schichtdauer wie viele Minuten Pause automatisch abgezogen werden.
            </p>
          </div>
          <table className="w-full text-sm text-[hsl(var(--foreground))]">
            <thead className="text-xs uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="text-left py-2">Ab Minuten</th>
                <th className="text-left py-2">Pausenminuten</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {pauseRules.map((rule) => (
                <tr key={rule.id} className="border-t border-[hsl(var(--border))]">
                  <td className="py-2 pr-2">
                    <FormFeedback action={updatePauseRuleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="pause_minutes" value={rule.pause_minutes} />
                      <input
                        name="min_minutes"
                        type="number"
                        defaultValue={rule.min_minutes}
                        className={`${inputBase} w-24 px-2 py-1`}
                        required
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                        disabled={isReadOnly}
                      >
                        Speichern
                      </button>
                    </FormFeedback>
                  </td>
                  <td className="py-2 pr-2">
                    <FormFeedback action={updatePauseRuleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="min_minutes" value={rule.min_minutes} />
                      <input
                        name="pause_minutes"
                        type="number"
                        defaultValue={rule.pause_minutes}
                        className={`${inputBase} w-24 px-2 py-1`}
                        required
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                        disabled={isReadOnly}
                      >
                        Speichern
                      </button>
                    </FormFeedback>
                  </td>
                  <td className="py-2 text-right">
                    <FormFeedback
                      action={deletePauseRuleAction}
                      successText="Gelöscht"
                      className="flex items-center justify-end"
                    >
                      <input type="hidden" name="id" value={rule.id} />
                      <button
                        type="submit"
                        className="text-xs text-amber-500 hover:text-amber-400 font-medium"
                        disabled={isReadOnly}
                      >
                        Löschen
                      </button>
                    </FormFeedback>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <FormFeedback
            action={createPauseRuleAction}
            successText="Regel angelegt"
            className="flex flex-wrap items-center gap-3"
          >
            <input
              name="min_minutes"
              type="number"
              placeholder="Ab Minuten"
              className={`${inputBase} w-32 px-2 py-1`}
              required
              disabled={isReadOnly}
            />
            <input
              name="pause_minutes"
              type="number"
              placeholder="Pause (Min)"
              className={`${inputBase} w-32 px-2 py-1`}
              required
              disabled={isReadOnly}
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg disabled:opacity-50"
              disabled={isReadOnly}
            >
              + Regel
            </button>
          </FormFeedback>
        </div>
      </div>
    </div>
  );
}
