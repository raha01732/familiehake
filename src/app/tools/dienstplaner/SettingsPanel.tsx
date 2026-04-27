// /workspace/familiehake/src/app/tools/dienstplaner/SettingsPanel.tsx
import {
  createPauseRuleAction,
  createShiftTrackAction,
  deletePauseRuleAction,
  deletePositionMatrixRowAction,
  deleteShiftTrackAction,
  saveEmploymentHourDefaultAction,
  savePositionMatrixRowAction,
  saveShiftTrackAction,
  saveWeekdayRequirementAction,
  updatePauseRuleAction,
} from "./actions";
import FormFeedback from "./components/FormFeedback";
import { EMPLOYMENT_TYPES } from "./utils";

type PauseRule = {
  id: number;
  min_minutes: number;
  pause_minutes: number;
};

type WeekdayRequirement = {
  weekday: number;
  required_shifts: number;
};

type ShiftTrack = {
  track_key: string;
  label: string;
  start_time: string;
  end_time: string;
};

type WeekdayPositionRequirement = {
  id: number;
  weekday: number;
  track_key: string;
  position: string;
  note: string | null;
};

type EmploymentHourDefaultRow = {
  employment_type: string;
  vacation_hours_per_day: number;
};

const WEEKDAYS_MON_FIRST = [
  { id: 1, label: "Montag", short: "Mo" },
  { id: 2, label: "Dienstag", short: "Di" },
  { id: 3, label: "Mittwoch", short: "Mi" },
  { id: 4, label: "Donnerstag", short: "Do" },
  { id: 5, label: "Freitag", short: "Fr" },
  { id: 6, label: "Samstag", short: "Sa" },
  { id: 0, label: "Sonntag", short: "So" },
];

type SettingsPanelProps = {
  pauseRules: PauseRule[];
  weekdayRequirements: WeekdayRequirement[];
  shiftTracks: ShiftTrack[];
  weekdayPositionRequirements: WeekdayPositionRequirement[];
  employmentHourDefaults: EmploymentHourDefaultRow[];
  isAdmin: boolean;
};

type MatrixRow = {
  trackKey: string;
  position: string;
  note: string | null;
  counts: number[]; // 7 entries, indexed by weekday id (0=Sun, 1=Mon, ...)
};

function buildPositionMatrix(
  shiftTracks: ShiftTrack[],
  requirements: WeekdayPositionRequirement[]
): Map<string, MatrixRow[]> {
  const grouped = new Map<string, Map<string, MatrixRow>>();
  for (const track of shiftTracks) {
    grouped.set(track.track_key, new Map());
  }
  for (const requirement of requirements) {
    const trackBucket = grouped.get(requirement.track_key);
    if (!trackBucket) continue;
    const existing = trackBucket.get(requirement.position) ?? {
      trackKey: requirement.track_key,
      position: requirement.position,
      note: null,
      counts: [0, 0, 0, 0, 0, 0, 0],
    };
    existing.counts[requirement.weekday] = (existing.counts[requirement.weekday] ?? 0) + 1;
    if (!existing.note && requirement.note) existing.note = requirement.note;
    trackBucket.set(requirement.position, existing);
  }
  const result = new Map<string, MatrixRow[]>();
  for (const [trackKey, bucket] of grouped) {
    result.set(
      trackKey,
      Array.from(bucket.values()).sort((a, b) => a.position.localeCompare(b.position, "de"))
    );
  }
  return result;
}

export default function SettingsPanel({
  pauseRules,
  weekdayRequirements,
  shiftTracks,
  weekdayPositionRequirements,
  employmentHourDefaults,
  isAdmin,
}: SettingsPanelProps) {
  const hourDefaultByType = new Map(
    employmentHourDefaults.map((d) => [d.employment_type, Number(d.vacation_hours_per_day) || 0])
  );
  const weekdayMap = new Map<number, number>();
  for (const rule of weekdayRequirements) {
    weekdayMap.set(rule.weekday, rule.required_shifts);
  }

  const positionMatrix = buildPositionMatrix(shiftTracks, weekdayPositionRequirements);

  const isReadOnly = !isAdmin;
  const inputBase =
    "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";
  const numberInputCls = `${inputBase} w-12 text-center px-1 py-1`;

  return (
    <div className="relative">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] backdrop-blur p-6 flex flex-col gap-8 shadow-xl">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Einstellungen</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Schienen, Wochentag-Bedarf und Pausenregeln werden direkt hier gepflegt.
            {isReadOnly ? " (Nur Admins können speichern.)" : ""}
          </p>
        </header>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Schienen</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Lege feste Schichtzeiten an (z.&nbsp;B. „Frühdienst 08:00–16:00“). Schienen bilden die Grundlage für den
              Positionsbedarf und die automatische Planung.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {shiftTracks.length === 0 && (
              <div className="text-xs text-amber-500">
                Noch keine Schienen angelegt. Lege unten deine erste Schicht an.
              </div>
            )}
            {shiftTracks.map((track) => (
              <div
                key={track.track_key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-2"
              >
                <FormFeedback
                  action={saveShiftTrackAction}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2"
                >
                  <input type="hidden" name="track_key" value={track.track_key} />
                  <input
                    name="label"
                    defaultValue={track.label}
                    className={`${inputBase} px-3 py-1.5`}
                    placeholder="Bezeichnung"
                    required
                    disabled={isReadOnly}
                  />
                  <input
                    name="start_time"
                    type="time"
                    defaultValue={track.start_time.slice(0, 5)}
                    className={`${inputBase} px-2 py-1.5 w-28`}
                    required
                    disabled={isReadOnly}
                  />
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={track.end_time.slice(0, 5)}
                    className={`${inputBase} px-2 py-1.5 w-28`}
                    required
                    disabled={isReadOnly}
                  />
                  <button
                    type="submit"
                    className="text-xs text-emerald-500 hover:text-emerald-400 px-2 font-medium"
                    disabled={isReadOnly}
                  >
                    Speichern
                  </button>
                </FormFeedback>
                <FormFeedback
                  action={deleteShiftTrackAction}
                  successText="Gelöscht"
                  className="flex items-center"
                >
                  <input type="hidden" name="track_key" value={track.track_key} />
                  <button
                    type="submit"
                    className="text-xs text-amber-500 hover:text-amber-400 px-2 font-medium"
                    disabled={isReadOnly}
                    title="Schiene löschen (entfernt auch zugehörigen Positionsbedarf)"
                  >
                    Löschen
                  </button>
                </FormFeedback>
              </div>
            ))}
          </div>

          <FormFeedback
            action={createShiftTrackAction}
            successText="Schiene angelegt"
            className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] pt-3"
          >
            <input
              name="label"
              placeholder="Neue Schiene (z.B. Frühdienst)"
              className={`${inputBase} px-3 py-1.5 flex-1 min-w-[180px]`}
              required
              disabled={isReadOnly}
            />
            <input
              name="start_time"
              type="time"
              className={`${inputBase} px-2 py-1.5 w-28`}
              required
              disabled={isReadOnly}
            />
            <input
              name="end_time"
              type="time"
              className={`${inputBase} px-2 py-1.5 w-28`}
              required
              disabled={isReadOnly}
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg disabled:opacity-50"
              disabled={isReadOnly}
            >
              + Schiene
            </button>
          </FormFeedback>
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Positionsbedarf pro Schiene</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Trage pro Position direkt die benötigte Anzahl je Wochentag ein. Eine Zeile = eine Position auf einer
              Schiene.
            </p>
          </div>

          {shiftTracks.length === 0 ? (
            <div className="text-xs text-amber-500">
              Lege zuerst Schienen an, bevor du den Positionsbedarf pflegst.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {shiftTracks.map((track) => {
                const rows = positionMatrix.get(track.track_key) ?? [];
                return (
                  <div
                    key={track.track_key}
                    className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-3 flex flex-col gap-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{track.label}</span>
                        <span className="ml-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                          {track.start_time.slice(0, 5)}–{track.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground)/0.7)]">
                        {rows.length} Position{rows.length === 1 ? "" : "en"}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-[hsl(var(--foreground))]">
                        <thead className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                          <tr>
                            <th className="text-left py-1 pr-2 w-44">Position</th>
                            {WEEKDAYS_MON_FIRST.map((weekday) => (
                              <th key={weekday.id} className="text-center py-1 px-1 w-12">
                                {weekday.short}
                              </th>
                            ))}
                            <th className="text-left py-1 px-2 w-48">Bemerkung</th>
                            <th className="py-1 w-28" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.position} className="border-t border-[hsl(var(--border))]/60">
                              <td className="py-1 pr-2" colSpan={10}>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                  <FormFeedback
                                    action={savePositionMatrixRowAction}
                                    className="grid grid-cols-[11rem_repeat(7,minmax(2.5rem,1fr))_12rem_auto_auto] items-center gap-2"
                                  >
                                    <input type="hidden" name="track_key" value={track.track_key} />
                                    <input type="hidden" name="original_position" value={row.position} />
                                    <input
                                      name="position"
                                      defaultValue={row.position}
                                      className={`${inputBase} px-2 py-1`}
                                      required
                                      disabled={isReadOnly}
                                    />
                                    {WEEKDAYS_MON_FIRST.map((weekday) => (
                                      <input
                                        key={weekday.id}
                                        type="number"
                                        min={0}
                                        step={1}
                                        name={`count_${weekday.id}`}
                                        defaultValue={row.counts[weekday.id] ?? 0}
                                        className={numberInputCls}
                                        disabled={isReadOnly}
                                        aria-label={`${row.position} ${weekday.label}`}
                                      />
                                    ))}
                                    <input
                                      name="note"
                                      defaultValue={row.note ?? ""}
                                      placeholder="Bemerkung"
                                      className={`${inputBase} px-2 py-1`}
                                      disabled={isReadOnly}
                                    />
                                    <button
                                      type="submit"
                                      className="text-xs text-emerald-500 hover:text-emerald-400 px-2 font-medium"
                                      disabled={isReadOnly}
                                    >
                                      Speichern
                                    </button>
                                  </FormFeedback>
                                  <FormFeedback
                                    action={deletePositionMatrixRowAction}
                                    successText="Gelöscht"
                                    className="flex items-center"
                                  >
                                    <input type="hidden" name="track_key" value={track.track_key} />
                                    <input type="hidden" name="position" value={row.position} />
                                    <button
                                      type="submit"
                                      className="text-xs text-amber-500 hover:text-amber-400 px-2 font-medium"
                                      disabled={isReadOnly}
                                      title="Diese Position-Zeile löschen"
                                    >
                                      Löschen
                                    </button>
                                  </FormFeedback>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr className="border-t border-[hsl(var(--border))]/60">
                              <td colSpan={10} className="py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                                Noch keine Position für diese Schiene.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <FormFeedback
                      action={savePositionMatrixRowAction}
                      successText="Position angelegt"
                      className="grid grid-cols-[11rem_repeat(7,minmax(2.5rem,1fr))_12rem_auto] items-center gap-2 border-t border-[hsl(var(--border))]/60 pt-2"
                    >
                      <input type="hidden" name="track_key" value={track.track_key} />
                      <input
                        name="position"
                        placeholder="Neue Position"
                        className={`${inputBase} px-2 py-1`}
                        required
                        disabled={isReadOnly}
                      />
                      {WEEKDAYS_MON_FIRST.map((weekday) => (
                        <input
                          key={weekday.id}
                          type="number"
                          min={0}
                          step={1}
                          name={`count_${weekday.id}`}
                          defaultValue={0}
                          className={numberInputCls}
                          disabled={isReadOnly}
                          aria-label={`Neue Position ${weekday.label}`}
                        />
                      ))}
                      <input
                        name="note"
                        placeholder="Bemerkung (optional)"
                        className={`${inputBase} px-2 py-1`}
                        disabled={isReadOnly}
                      />
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-1 px-3 rounded-lg disabled:opacity-50"
                        disabled={isReadOnly}
                      >
                        + Position
                      </button>
                    </FormFeedback>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Schichtbedarf pro Wochentag</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Optionaler Fallback: Anzahl der Schichten pro Wochentag, wenn kein Positionsbedarf hinterlegt ist.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-[hsl(var(--foreground))]">
            {WEEKDAYS_MON_FIRST.map((weekday) => (
              <FormFeedback
                key={weekday.id}
                action={saveWeekdayRequirementAction}
                className="flex items-center gap-3"
              >
                <input type="hidden" name="weekday" value={weekday.id} />
                <span className="w-28 text-[hsl(var(--foreground))]">{weekday.label}</span>
                <input
                  name="required_shifts"
                  type="number"
                  min="0"
                  defaultValue={weekdayMap.get(weekday.id) ?? 0}
                  className={`${inputBase} w-20 px-2 py-1`}
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
            ))}
          </div>
        </div>

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
