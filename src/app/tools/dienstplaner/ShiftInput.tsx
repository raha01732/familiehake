// /workspace/familiehake/src/app/tools/dienstplaner/ShiftInput.tsx
"use client";

import { type DragEvent, useState, useTransition } from "react";
import { addHoursToTime } from "./utils";

type ShiftInputProps = {
  baseName: string;
  label: string;
  initialStart: string;
  initialEnd: string;
  employeeId: number;
  date: string;
  formId: string;
  isServiceleitung: boolean;
  hasShift: boolean;
  initialPauseMinutes: number | null;
  initialComment: string | null;
   
  saveAction: (formData: FormData) => Promise<void>;
   
  moveAction: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
   
  updateDetailsAction: (formData: FormData) => Promise<void>;
};

export default function ShiftInput({
  baseName,
  label,
  initialStart,
  initialEnd,
  employeeId,
  date,
  formId,
  isServiceleitung,
  hasShift,
  initialPauseMinutes,
  initialComment,
  saveAction,
  moveAction,
  updateDetailsAction,
}: ShiftInputProps) {
  const [startValue, setStartValue] = useState(initialStart);
  const [endValue, setEndValue] = useState(initialEnd);
  const [pauseMinutesValue, setPauseMinutesValue] = useState(initialPauseMinutes ? String(initialPauseMinutes) : "");
  const [commentValue, setCommentValue] = useState(initialComment ?? "");
  const [isPending, startTransition] = useTransition();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [moveFeedback, setMoveFeedback] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const hasAssignedShift = hasShift || Boolean(startValue && endValue);

  const handleBlur = () => {
    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("shift_date", date);
    formData.set("start_time", startValue);
    formData.set("end_time", endValue);

    startTransition(() => {
      void saveAction(formData)
        .then(() => setSaveFeedback(null))
        .catch(() => setSaveFeedback("Schicht konnte nicht gespeichert werden."));
    });
  };

  const applyServiceleitungPreset = () => {
    if (!isServiceleitung) return;
    const normalizedStart = startValue || "09:00";
    const normalizedEnd = addHoursToTime(normalizedStart, 8) ?? "17:00";
    setStartValue(normalizedStart);
    setEndValue(normalizedEnd);

    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("shift_date", date);
    formData.set("start_time", normalizedStart);
    formData.set("end_time", normalizedEnd);
    startTransition(() => {
      void saveAction(formData)
        .then(() => setSaveFeedback(null))
        .catch(() => setSaveFeedback("Schicht konnte nicht gespeichert werden."));
    });
  };

  const handleDropShift = (payload: string) => {
    try {
      if (hasAssignedShift) return;
      const parsedPayload = JSON.parse(payload) as { employeeId?: number; date?: string };
      if (!parsedPayload.employeeId || !parsedPayload.date) return;
      if (parsedPayload.employeeId === employeeId || parsedPayload.date !== date) return;

      const formData = new FormData();
      formData.set("from_employee_id", String(parsedPayload.employeeId));
      formData.set("to_employee_id", String(employeeId));
      formData.set("shift_date", date);
      startTransition(() => {
        void moveAction(formData).then((result) => {
          if (!result.ok) {
            setMoveFeedback(result.message ?? "Schicht konnte nicht verschoben werden.");
            return;
          }
          setMoveFeedback("Schicht erfolgreich verschoben.");
        });
      });
    } catch {
      // noop: invalid drag payload
    }
  };

  const parseDropPayload = (event: DragEvent<HTMLDivElement>) => {
    const customPayload = event.dataTransfer.getData("application/x-dienstplan-shift");
    if (customPayload) return customPayload;
    return event.dataTransfer.getData("text/plain");
  };

  const saveDetails = () => {
    if (!startValue || !endValue) return;
    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("shift_date", date);
    formData.set("start_time", startValue);
    formData.set("end_time", endValue);
    formData.set("break_minutes", pauseMinutesValue);
    formData.set("comment", commentValue);

    startTransition(() => {
      void updateDetailsAction(formData)
        .then(() => setSaveFeedback(null))
        .catch(() => setSaveFeedback("Details konnten nicht gespeichert werden."));
    });
    setIsEditorOpen(false);
  };

  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleDropShift(parseDropPayload(event));
      }}
    >
      {hasAssignedShift && (
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            const payload = JSON.stringify({ employeeId, date });
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-dienstplan-shift", payload);
            event.dataTransfer.setData("text/plain", payload);
          }}
          onClick={() => setIsEditorOpen(true)}
          className="w-full rounded-xl border border-cyan-700/50 bg-cyan-500/10 px-2 py-1 text-left text-[11px] text-cyan-100 hover:bg-cyan-500/20"
          title="Zum Bearbeiten klicken oder auf andere Person ziehen"
        >
          <div className="font-semibold">Schicht-Kästchen</div>
          <div>
            {startValue || "--:--"} – {endValue || "--:--"}
          </div>
        </button>
      )}
      <div className="flex items-center gap-2">
        <input
          form={formId}
          name={`${baseName}:start`}
          type="time"
          value={startValue}
          onChange={(event) => setStartValue(event.target.value)}
          onBlur={handleBlur}
          className="w-24 rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-cyan-500/70 focus:outline-none"
          aria-label={`${label} Start`}
        />
        <input
          form={formId}
          name={`${baseName}:end`}
          type="time"
          value={endValue}
          onChange={(event) => setEndValue(event.target.value)}
          onBlur={handleBlur}
          className="w-24 rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-cyan-500/70 focus:outline-none"
          aria-label={`${label} Ende`}
        />
        {isServiceleitung && (
          <button
            type="button"
            onClick={applyServiceleitungPreset}
            className="rounded-xl border border-cyan-600/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            8h
          </button>
        )}
      </div>
      <span className={`text-[10px] ${isPending ? "text-amber-400" : "text-zinc-500"}`}>
        {isPending ? "Speichern..." : "Auto-Save"}
      </span>
      {saveFeedback && <span className="text-[10px] text-rose-300">{saveFeedback}</span>}
      {moveFeedback && <span className="text-[10px] text-cyan-300">{moveFeedback}</span>}

      {isEditorOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
            <h4 className="text-sm font-semibold text-zinc-100">Schicht bearbeiten</h4>
            <p className="mb-4 text-xs text-zinc-400">{label}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-300">
                Start
                <input
                  type="time"
                  value={startValue}
                  onChange={(event) => setStartValue(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-zinc-300">
                Ende
                <input
                  type="time"
                  value={endValue}
                  onChange={(event) => setEndValue(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block text-xs text-zinc-300">
              Pause (Minuten, optional)
              <input
                type="number"
                min="0"
                value={pauseMinutesValue}
                onChange={(event) => setPauseMinutesValue(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-300">
              Kommentar
              <textarea
                value={commentValue}
                onChange={(event) => setCommentValue(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-xl border border-zinc-600 px-3 py-1 text-xs text-zinc-300"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={saveDetails}
                className="rounded-xl bg-cyan-600 px-3 py-1 text-xs font-medium text-white"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
