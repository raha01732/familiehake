// src/app/tools/dienstplaner/DayRequirementCell.tsx
"use client";

import { useMemo, useState } from "react";
import {
  applyWeekdayDefaultsToDateAction,
  clearDateRequirementAction,
  clearPositionRequirementsAction,
  deletePositionRequirementAction,
  saveDateRequirementAction,
  upsertPositionRequirementAction,
} from "./actions";

type PositionRequirement = {
  requirement_date: string;
  position: string;
  track_key: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
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

type DayRequirementCellProps = {
  dateKey: string;
  dateLabel: string;
  requiredShifts: number;
  positionRequirementsForDay: PositionRequirement[];
  shiftTracks: ShiftTrack[];
  weekdayPositionRequirements: WeekdayPositionRequirement[];
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
  shiftTracks,
  weekdayPositionRequirements,
}: DayRequirementCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newTrackKey, setNewTrackKey] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");

  const trackMap = useMemo(
    () => new Map(shiftTracks.map((track) => [track.track_key, track])),
    [shiftTracks]
  );

  const baseRequirements = useMemo(() => {
    return weekdayPositionRequirements
      .map((rule) => {
        const track = trackMap.get(rule.track_key);
        if (!track) return null;
        return {
          key: `${rule.position}-${rule.track_key}`,
          position: rule.position,
          track_key: rule.track_key,
          track_label: track.label,
          start_time: track.start_time,
          end_time: track.end_time,
          note: rule.note,
        };
      })
      .filter(Boolean) as {
      key: string;
      position: string;
      track_key: string;
      track_label: string;
      start_time: string;
      end_time: string;
      note: string | null;
    }[];
  }, [weekdayPositionRequirements, trackMap]);

  const summaryRequirements = useMemo(() => {
    if (positionRequirementsForDay.length > 0) {
      return positionRequirementsForDay.map((requirement) => ({
        key: `${requirement.position}-${requirement.start_time}-${requirement.end_time}`,
        label: `${requirement.position} ${toTimeInputValue(requirement.start_time)}–${toTimeInputValue(
          requirement.end_time
        )}`.trim(),
        trackLabel: requirement.track_key ? trackMap.get(requirement.track_key)?.label : null,
        note: requirement.note,
      }));
    }
    return baseRequirements.map((requirement) => ({
      key: requirement.key,
      label: `${requirement.position} ${toTimeInputValue(requirement.start_time)}–${toTimeInputValue(
        requirement.end_time
      )}`.trim(),
      trackLabel: requirement.track_label,
      note: requirement.note,
    }));
  }, [positionRequirementsForDay, baseRequirements, trackMap]);

  const handleEditComplete = () => {
    setIsEditing(false);
  };

  const handleTrackChange = (value: string) => {
    setNewTrackKey(value);
    const track = trackMap.get(value);
    if (track) {
      setNewStartTime(toTimeInputValue(track.start_time));
      setNewEndTime(toTimeInputValue(track.end_time));
    }
  };

  return (
    <>
      <td className="py-3 pl-4 pr-2 text-zinc-300 whitespace-nowrap align-top w-[190px]">
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
        {!isEditing && summaryRequirements.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-[11px] text-zinc-400">
            {summaryRequirements.map((entry) => (
              <li key={entry.key}>
                <span className="font-medium text-zinc-300">{entry.label}</span>
                {entry.trackLabel ? <span className="text-zinc-500"> · {entry.trackLabel}</span> : null}
                {entry.note ? <span className="text-zinc-500"> — {entry.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-3 pl-2 pr-4 align-top">
        {!isEditing ? (
          <div className="text-[11px] text-zinc-500">Bearbeiten öffnet die Detailansicht.</div>
        ) : (
          <div className="fixed inset-0 z-[90]">
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative mx-auto mt-16 w-[min(96vw,980px)] max-w-4xl card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <div className="text-sm font-semibold text-zinc-100">Tagesdetails bearbeiten</div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs rounded-lg border border-zinc-700 text-zinc-300 px-2 py-1 hover:bg-zinc-800/60"
                >
                  Schließen
                </button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div className="text-sm text-zinc-400">
                  {dateLabel} · Tagesbedarf &amp; Schienen-Overrides
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <form
                    action={saveDateRequirementAction}
                    className="flex flex-col gap-2"
                    onSubmit={handleEditComplete}
                  >
                    <input type="hidden" name="requirement_date" value={dateKey} />
                    <label className="text-[11px] text-zinc-400">Tagesbedarf</label>
                    <div className="flex flex-wrap items-center gap-2">
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

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col gap-2">
                  <div className="text-[11px] text-zinc-400">Grundbedarf (aus Grundeinstellungen)</div>
                  {baseRequirements.length === 0 ? (
                    <div className="text-[11px] text-zinc-500">Keine Grundregeln hinterlegt.</div>
                  ) : (
                    <ul className="text-[11px] text-zinc-300 flex flex-col gap-1">
                      {baseRequirements.map((requirement) => (
                        <li key={requirement.key}>
                          <span className="font-medium">{requirement.position}</span>{" "}
                          {toTimeInputValue(requirement.start_time)}–{toTimeInputValue(requirement.end_time)} ·{" "}
                          {requirement.track_label}
                          {requirement.note ? <span className="text-zinc-500"> — {requirement.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={applyWeekdayDefaultsToDateAction} onSubmit={handleEditComplete}>
                      <input type="hidden" name="requirement_date" value={dateKey} />
                      <button type="submit" className="text-[11px] text-emerald-400 hover:text-emerald-300">
                        Grundbedarf übernehmen
                      </button>
                    </form>
                    <form action={clearPositionRequirementsAction} onSubmit={handleEditComplete}>
                      <input type="hidden" name="requirement_date" value={dateKey} />
                      <button type="submit" className="text-[11px] text-amber-400 hover:text-amber-300">
                        Tages-Overrides entfernen
                      </button>
                    </form>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {positionRequirementsForDay.map((requirement) => (
                    <div
                      key={`${requirement.position}-${requirement.start_time}-${requirement.end_time}`}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            name="position"
                            defaultValue={requirement.position}
                            placeholder="Position"
                            className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                          />
                          <select
                            name="track_key"
                            defaultValue={requirement.track_key ?? ""}
                            className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                          >
                            <option value="">Individuell</option>
                            {shiftTracks.map((track) => (
                              <option key={track.track_key} value={track.track_key}>
                                {track.label}
                              </option>
                            ))}
                          </select>
                          <input
                            name="note"
                            defaultValue={requirement.note ?? ""}
                            placeholder="Bemerkung"
                            className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  <div className="rounded-lg border border-dashed border-zinc-800 p-3">
                    <form
                      action={upsertPositionRequirementAction}
                      className="flex flex-col gap-2"
                      onSubmit={handleEditComplete}
                    >
                      <input type="hidden" name="requirement_date" value={dateKey} />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          name="position"
                          placeholder="Position"
                          className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                        />
                        <select
                          name="track_key"
                          value={newTrackKey}
                          onChange={(event) => handleTrackChange(event.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                        >
                          <option value="">Schiene wählen</option>
                          {shiftTracks.map((track) => (
                            <option key={track.track_key} value={track.track_key}>
                              {track.label}
                            </option>
                          ))}
                        </select>
                        <input
                          name="note"
                          placeholder="Bemerkung"
                          className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          name="start_time"
                          type="time"
                          value={newStartTime}
                          onChange={(event) => setNewStartTime(event.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
                        />
                        <input
                          name="end_time"
                          type="time"
                          value={newEndTime}
                          onChange={(event) => setNewEndTime(event.target.value)}
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
              </div>
            </div>
          </div>
        )}
      </td>
    </>
  );
}
