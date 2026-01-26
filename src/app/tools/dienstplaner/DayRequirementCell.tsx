// src/app/tools/dienstplaner/DayRequirementCell.tsx
"use client";

import { useMemo, useState } from "react";
import {
  clearDateRequirementAction,
  deletePositionRequirementAction,
  saveDateRequirementAction,
  upsertPositionRequirementAction,
} from "./actions";

type PositionRequirement = {
  requirement_date: string;
  position: string;
  start_time: string;
  end_time: string;
  note: string | null;
};

type DayRequirementCellProps = {
  dateKey: string;
  dateLabel: string;
  requiredShifts: number;
  positionRequirementsForDay: PositionRequirement[];
};

function toTimeInputValue(value: string | null) {
  if (!value) return "";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export default function DayRequirementCell({
  dateKey,
  dateLabel,
  requiredShifts,
  positionRequirementsForDay,
}: DayRequirementCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const noteSummary = useMemo(
    () =>
      positionRequirementsForDay.map((requirement) => ({
        key: `${requirement.position}-${requirement.start_time}-${requirement.end_time}`,
        label: `${requirement.position} ${toTimeInputValue(requirement.start_time)}–${toTimeInputValue(
          requirement.end_time
        )}`.trim(),
        note: requirement.note,
      })),
    [positionRequirementsForDay]
  );

  const handleEditComplete = () => {
    setIsEditing(false);
  };

  return (
    <>
      <td className="py-3 px-4 text-zinc-300 whitespace-nowrap align-top">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">{dateLabel}</div>
            <div className="text-[11px] text-zinc-500 mt-2">
              Bedarf: {requiredShifts} Schicht{requiredShifts === 1 ? "" : "en"}
            </div>
          </div>
          <button
            type="button"
            className="text-[11px] text-emerald-400 hover:text-emerald-300"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {isEditing ? "Schließen" : "Bearbeiten"}
          </button>
        </div>
        {!isEditing && noteSummary.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-[11px] text-zinc-400">
            {noteSummary.map((entry) => (
              <li key={entry.key}>
                <span className="font-medium text-zinc-300">{entry.label}</span>
                {entry.note ? <span className="text-zinc-500"> — {entry.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-3 px-4 align-top">
        {!isEditing ? (
          <div className="text-[11px] text-zinc-500">Bearbeiten öffnet die Detailansicht.</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
              <form
                action={saveDateRequirementAction}
                className="flex flex-col gap-2"
                onSubmit={handleEditComplete}
              >
                <input type="hidden" name="requirement_date" value={dateKey} />
                <label className="text-[11px] text-zinc-400">Tagesbedarf</label>
                <div className="flex items-center gap-2">
                  <input
                    name="required_shifts"
                    type="number"
                    min="0"
                    defaultValue={requiredShifts}
                    className="w-20 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                  />
                  <button type="submit" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                    Bedarf speichern
                  </button>
                </div>
              </form>
              <form action={clearDateRequirementAction} onSubmit={handleEditComplete}>
                <input type="hidden" name="requirement_date" value={dateKey} />
                <button type="submit" className="text-[11px] text-amber-400 hover:text-amber-300">
                  Auf Grundregel zurücksetzen
                </button>
              </form>
            </div>
            {positionRequirementsForDay.map((requirement) => (
              <div
                key={`${requirement.position}-${requirement.start_time}-${requirement.end_time}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2"
              >
                <form
                  action={upsertPositionRequirementAction}
                  className="flex flex-col gap-2"
                  onSubmit={handleEditComplete}
                >
                  <input type="hidden" name="requirement_date" value={dateKey} />
                  <input type="hidden" name="original_position" value={requirement.position} />
                  <input type="hidden" name="original_start_time" value={requirement.start_time} />
                  <input type="hidden" name="original_end_time" value={requirement.end_time} />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="position"
                      defaultValue={requirement.position}
                      placeholder="Position"
                      className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                    />
                    <input
                      name="note"
                      defaultValue={requirement.note ?? ""}
                      placeholder="Bemerkung"
                      className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="start_time"
                      type="time"
                      defaultValue={toTimeInputValue(requirement.start_time)}
                      className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                    />
                    <input
                      name="end_time"
                      type="time"
                      defaultValue={toTimeInputValue(requirement.end_time)}
                      className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="submit" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                      Speichern
                    </button>
                  </div>
                </form>
                <form action={deletePositionRequirementAction} className="mt-1" onSubmit={handleEditComplete}>
                  <input type="hidden" name="requirement_date" value={dateKey} />
                  <input type="hidden" name="position" value={requirement.position} />
                  <input type="hidden" name="start_time" value={requirement.start_time} />
                  <input type="hidden" name="end_time" value={requirement.end_time} />
                  <button type="submit" className="text-[11px] text-amber-400 hover:text-amber-300">
                    Eintrag löschen
                  </button>
                </form>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-zinc-800 p-2">
              <form
                action={upsertPositionRequirementAction}
                className="flex flex-col gap-2"
                onSubmit={handleEditComplete}
              >
                <input type="hidden" name="requirement_date" value={dateKey} />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="position"
                    placeholder="Position"
                    className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                  />
                  <input
                    name="note"
                    placeholder="Bemerkung"
                    className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="start_time"
                    type="time"
                    className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                  />
                  <input
                    name="end_time"
                    type="time"
                    className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                    Bedarf hinzufügen
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-zinc-400 hover:text-zinc-300"
                    onClick={() => setIsEditing(false)}
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </td>
    </>
  );
}
