"use client";

import { useState, useTransition } from "react";
import {
  closeDayAction,
  deleteDayRequirementAction,
  resetDayRequirementsAction,
  saveDayRequirementAction,
  startDayOverrideAction,
} from "../actions";
import {
  CLOSED_DAY_POSITION,
  POSITION_KINDS,
  describePosition,
  kindOfPosition,
  slotsForDate,
  type DayRequirement,
  type PositionKindValue,
  type ShiftRule,
} from "../requirements";

type Props = {
  date: string;
  rules: ShiftRule[];
  /** Alle Tages-Anpassungen des angezeigten Monats */
  dayRequirements: DayRequirement[];
};

const inputCls =
  "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";

type RunFn = (action: (fd: FormData) => Promise<void>, fd: FormData) => void;

function RequirementRow({
  date,
  row,
  run,
  busy,
}: {
  date: string;
  row?: DayRequirement;
  run: RunFn;
  busy: boolean;
}) {
  const initial = row ? kindOfPosition(row.position, row.require_leader) : { kind: "serviceleitung" as PositionKindValue, custom: "" };
  const [kind, setKind] = useState<PositionKindValue>(initial.kind);

  function onSubmit(formData: FormData) {
    run(saveDayRequirementAction, formData);
  }

  return (
    <form action={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requirement_date" value={date} />
      {row && (
        <>
          <input type="hidden" name="original_position" value={row.position} />
          <input type="hidden" name="original_start_time" value={row.start_time} />
          <input type="hidden" name="original_end_time" value={row.end_time} />
        </>
      )}
      <select
        name="position_kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as PositionKindValue)}
        className={`${inputCls} min-w-[11rem]`}
        disabled={busy}
      >
        {POSITION_KINDS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
        <option value="custom">Andere Position …</option>
      </select>
      {kind === "custom" && (
        <input
          name="position_custom"
          defaultValue={initial.custom}
          placeholder="Position"
          className={`${inputCls} w-32`}
          required
          disabled={busy}
        />
      )}
      <input
        name="start_time"
        type="time"
        defaultValue={row?.start_time ?? ""}
        className={`${inputCls} w-24`}
        required
        disabled={busy}
      />
      <span className="text-xs text-[hsl(var(--muted-foreground))]">–</span>
      <input
        name="end_time"
        type="time"
        defaultValue={row?.end_time ?? ""}
        className={`${inputCls} w-24`}
        required
        disabled={busy}
      />
      <input
        name="required_count"
        type="number"
        min={1}
        max={10}
        defaultValue={row?.required_count ?? 1}
        title="Anzahl Personen"
        className={`${inputCls} w-14`}
        disabled={busy}
      />
      <input
        name="note"
        defaultValue={row?.note ?? ""}
        placeholder="Bemerkung"
        className={`${inputCls} flex-1 min-w-[6rem]`}
        disabled={busy}
      />
      <button
        type="submit"
        className={
          row
            ? "text-xs text-emerald-500 hover:text-emerald-400 px-2 font-medium"
            : "bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
        }
        disabled={busy}
      >
        {row ? "Speichern" : "+ Zeile"}
      </button>
      {row && (
        <button
          type="submit"
          formNoValidate
          formAction={() => {
            const fd = new FormData();
            fd.set("requirement_date", date);
            fd.set("position", row.position);
            fd.set("start_time", row.start_time);
            fd.set("end_time", row.end_time);
            run(deleteDayRequirementAction, fd);
          }}
          className="text-xs text-[hsl(var(--destructive))] hover:opacity-80 px-2 font-medium"
          disabled={busy}
        >
          Entfernen
        </button>
      )}
    </form>
  );
}

export default function DayRequirementsSection({ date, rules, dayRequirements }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rows = dayRequirements.filter((item) => item.requirement_date === date);
  const overridden = rows.length > 0;
  const realRows = rows.filter((item) => item.required_count > 0 && item.position !== CLOSED_DAY_POSITION);
  const closed = overridden && realRows.length === 0;

  const ruleSlots = slotsForDate(date, rules, []).slots;
  const ruleSummary = new Map<string, { label: string; time: string; count: number }>();
  for (const slot of ruleSlots) {
    const key = `${slot.position}|${slot.require_leader}|${slot.start_time}|${slot.end_time}`;
    const current = ruleSummary.get(key);
    if (current) current.count += 1;
    else
      ruleSummary.set(key, {
        label: describePosition(slot.position, slot.require_leader),
        time: `${slot.start_time}–${slot.end_time}`,
        count: 1,
      });
  }

  const run: RunFn = (action, formData) => {
    startTransition(async () => {
      setError(null);
      try {
        await action(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
      }
    });
  };

  function simple(action: (fd: FormData) => Promise<void>) {
    const fd = new FormData();
    fd.set("requirement_date", date);
    run(action, fd);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Schichtanforderungen dieses Tages</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            overridden ? "bg-amber-500/15 text-amber-500" : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
          }`}
        >
          {overridden ? "Für diesen Tag angepasst" : "Wochenregeln"}
        </span>
      </div>

      {error && <p className="text-xs text-[hsl(var(--destructive))]">{error}</p>}

      {!overridden && (
        <>
          {ruleSummary.size === 0 ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Für diesen Wochentag ist keine Regel hinterlegt.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {Array.from(ruleSummary.values()).map((entry) => (
                <li key={`${entry.label}-${entry.time}`} className="text-xs text-[hsl(var(--foreground))]">
                  <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{entry.time}</span> {entry.label}
                  {entry.count > 1 && <span className="text-[hsl(var(--muted-foreground))]"> ×{entry.count}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => simple(startDayOverrideAction)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              Nur für diesen Tag anpassen
            </button>
            <button
              type="button"
              onClick={() => simple(closeDayAction)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              Tag ohne Bedarf
            </button>
          </div>
        </>
      )}

      {overridden && (
        <>
          {closed ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Kein Bedarf an diesem Tag – es werden keine offenen Slots angelegt.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {realRows.map((row) => (
                <div
                  key={`${row.position}-${row.start_time}-${row.end_time}`}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-2"
                >
                  <RequirementRow date={date} row={row} run={run} busy={isPending} />
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[hsl(var(--border))] pt-2">
            <RequirementRow date={date} run={run} busy={isPending} />
          </div>

          <div className="flex flex-wrap gap-2">
            {!closed && (
              <button
                type="button"
                onClick={() => simple(closeDayAction)}
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] disabled:opacity-50"
              >
                Tag ohne Bedarf
              </button>
            )}
            <button
              type="button"
              onClick={() => simple(resetDayRequirementsAction)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-md bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              Zurück zu den Wochenregeln
            </button>
          </div>
        </>
      )}
    </section>
  );
}
