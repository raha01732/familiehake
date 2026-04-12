// /workspace/familiehake/src/app/tools/dienstplaner/ShiftInput.tsx
"use client";

import { useState, useTransition } from "react";
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
  // eslint-disable-next-line no-unused-vars
  saveAction: (formData: FormData) => Promise<void>;
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
  saveAction,
}: ShiftInputProps) {
  const [startValue, setStartValue] = useState(initialStart);
  const [endValue, setEndValue] = useState(initialEnd);
  const [isPending, startTransition] = useTransition();

  const handleBlur = () => {
    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("shift_date", date);
    formData.set("start_time", startValue);
    formData.set("end_time", endValue);

    startTransition(() => {
      void saveAction(formData);
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
      void saveAction(formData);
    });
  };

  return (
    <div className="flex flex-col gap-1">
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
    </div>
  );
}
