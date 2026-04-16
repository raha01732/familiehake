"use client";

import { useRef, useTransition, useState } from "react";
import type { Employee, Shift, ShiftTrack } from "../utils";
import { getInitials } from "../utils";

type Props = {
  employee: Employee;
  allEmployees: Employee[];
  date: string;
  shift: Shift | null;
  shiftTracks: ShiftTrack[];
  onClose: () => void;
  saveAction: (_fd: FormData) => Promise<void>;
  deleteAction: (_fd: FormData) => Promise<void>;
  moveAction: (_fd: FormData) => Promise<void>;
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const wd = WEEKDAY_LABELS[d.getUTCDay()];
  return `${wd}, ${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

const inputCls =
  "w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] placeholder:text-[hsl(var(--muted-foreground)/0.6)]";

export default function ShiftModal({
  employee,
  allEmployees,
  date,
  shift,
  shiftTracks,
  onClose,
  saveAction,
  deleteAction,
  moveAction,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employee.id);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setSaveError(null);

    startTransition(async () => {
      try {
        if (shift && selectedEmployeeId !== employee.id) {
          const moveFd = new FormData();
          moveFd.set("from_employee_id", String(employee.id));
          moveFd.set("to_employee_id", String(selectedEmployeeId));
          moveFd.set("shift_date", date);
          await moveAction(moveFd);
          fd.set("employee_id", String(selectedEmployeeId));
        } else {
          fd.set("employee_id", String(selectedEmployeeId));
        }
        await saveAction(fd);
        onClose();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("employee_id", String(employee.id));
    fd.set("shift_date", date);
    startDelete(async () => {
      await deleteAction(fd);
      onClose();
    });
  }

  function applyTrack(track: ShiftTrack) {
    if (!formRef.current) return;
    const startInput = formRef.current.querySelector<HTMLInputElement>('input[name="start_time"]');
    const endInput = formRef.current.querySelector<HTMLInputElement>('input[name="end_time"]');
    if (startInput) startInput.value = track.start_time.slice(0, 5);
    if (endInput) endInput.value = track.end_time.slice(0, 5);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))]">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: employee.color }}
          >
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[hsl(var(--foreground))] truncate">{employee.name}</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">{formatDateLabel(date)}</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSave} className="p-5 space-y-4">
          <input type="hidden" name="employee_id" value={employee.id} />
          <input type="hidden" name="shift_date" value={date} />

          {/* Employee selector */}
          {allEmployees.length > 1 && (
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Mitarbeiter</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                className={inputCls}
              >
                {allEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.position ? ` – ${emp.position}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick presets */}
          {shiftTracks.length > 0 && (
            <div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2">Schnellauswahl</div>
              <div className="flex flex-wrap gap-2">
                {shiftTracks.map((track) => (
                  <button
                    key={track.track_key}
                    type="button"
                    onClick={() => applyTrack(track)}
                    className="px-3 py-1.5 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-xs rounded-lg transition-colors"
                  >
                    <span className="font-medium">{track.label}</span>
                    <span className="text-[hsl(var(--muted-foreground))] ml-1.5">
                      {track.start_time.slice(0, 5)}–{track.end_time.slice(0, 5)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Beginn</label>
              <input
                type="time"
                name="start_time"
                defaultValue={shift?.start_time?.slice(0, 5) ?? ""}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Ende</label>
              <input
                type="time"
                name="end_time"
                defaultValue={shift?.end_time?.slice(0, 5) ?? ""}
                className={inputCls}
              />
            </div>
          </div>

          {/* Break */}
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Pause (Minuten, optional)</label>
            <input
              type="number"
              name="break_minutes"
              defaultValue={shift?.break_minutes ?? ""}
              min={0}
              max={480}
              placeholder="Automatisch aus Pausenregeln"
              className={inputCls}
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Notiz (optional)</label>
            <input
              type="text"
              name="comment"
              defaultValue={shift?.comment ?? ""}
              placeholder="z.B. Vertretung, früher raus …"
              className={inputCls}
            />
          </div>

          {/* Error */}
          {saveError && (
            <div className="px-3 py-2 bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.5)] text-[hsl(var(--destructive))] text-sm rounded-lg">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {shift && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? "…" : "Schicht löschen"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm rounded-lg transition-colors ml-auto"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              {isPending ? "Speichern …" : shift ? "Speichern" : "Schicht anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
