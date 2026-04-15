"use client";

import { useRef, useTransition } from "react";
import type { Employee, Shift, ShiftTrack } from "../utils";
import { getInitials } from "../utils";

type Props = {
  employee: Employee;
  date: string;
  shift: Shift | null;
  shiftTracks: ShiftTrack[];
  onClose: () => void;
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const wd = WEEKDAY_LABELS[d.getUTCDay()];
  return `${wd}, ${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

export default function ShiftModal({
  employee,
  date,
  shift,
  shiftTracks,
  onClose,
  saveAction,
  deleteAction,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(async () => {
      await saveAction(fd);
      onClose();
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
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-zinc-800">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: employee.color }}
          >
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-100 truncate">{employee.name}</div>
            <div className="text-xs text-zinc-400">{formatDateLabel(date)}</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSave} className="p-5 space-y-4">
          <input type="hidden" name="employee_id" value={employee.id} />
          <input type="hidden" name="shift_date" value={date} />

          {/* Quick presets */}
          {shiftTracks.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Schnellauswahl</div>
              <div className="flex flex-wrap gap-2">
                {shiftTracks.map((track) => (
                  <button
                    key={track.track_key}
                    type="button"
                    onClick={() => applyTrack(track)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs rounded-lg transition-colors"
                  >
                    <span className="font-medium">{track.label}</span>
                    <span className="text-zinc-500 ml-1.5">
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
              <label className="block text-xs text-zinc-400 mb-1.5">Beginn</label>
              <input
                type="time"
                name="start_time"
                defaultValue={shift?.start_time?.slice(0, 5) ?? ""}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Ende</label>
              <input
                type="time"
                name="end_time"
                defaultValue={shift?.end_time?.slice(0, 5) ?? ""}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Break */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Pause (Minuten, optional)</label>
            <input
              type="number"
              name="break_minutes"
              defaultValue={shift?.break_minutes ?? ""}
              min={0}
              max={480}
              placeholder="Automatisch aus Pausenregeln"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Notiz (optional)</label>
            <input
              type="text"
              name="comment"
              defaultValue={shift?.comment ?? ""}
              placeholder="z.B. Vertretung, früher raus …"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {shift && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 hover:text-red-100 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? "…" : "Schicht löschen"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors ml-auto"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? "Speichern …" : shift ? "Speichern" : "Schicht anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
