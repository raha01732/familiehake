// src/app/tools/dienstplaner/ShiftInput.tsx
"use client";

import { useState, useTransition } from "react";

type ShiftInputProps = {
  baseName: string;
  label: string;
  initialStart: string;
  initialEnd: string;
  employeeId: number;
  date: string;
  formId: string;
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
          className="w-24 bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 px-2 py-1 rounded"
          aria-label={`${label} Start`}
        />
        <input
          form={formId}
          name={`${baseName}:end`}
          type="time"
          value={endValue}
          onChange={(event) => setEndValue(event.target.value)}
          onBlur={handleBlur}
          className="w-24 bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 px-2 py-1 rounded"
          aria-label={`${label} Ende`}
        />
      </div>
      <span className={`text-[10px] ${isPending ? "text-amber-400" : "text-zinc-500"}`}>
        {isPending ? "Speichern..." : "Auto-Save"}
      </span>
    </div>
  );
}
