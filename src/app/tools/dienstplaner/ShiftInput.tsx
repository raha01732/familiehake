// src/app/tools/dienstplaner/ShiftInput.tsx
"use client";

import { useState, useTransition } from "react";

type ShiftInputProps = {
  name: string;
  label: string;
  initialValue: string;
  employeeId: number;
  date: string;
  formId: string;
  saveAction: (formData: FormData) => Promise<void>;
};

export default function ShiftInput({
  name,
  label,
  initialValue,
  employeeId,
  date,
  formId,
  saveAction,
}: ShiftInputProps) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  const handleBlur = () => {
    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("shift_date", date);
    formData.set("value", value);

    startTransition(() => {
      void saveAction(formData);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        form={formId}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        placeholder="08:00-16:30"
        className="w-28 bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 px-2 py-1 rounded"
        aria-label={label}
      />
      <span className={`text-[10px] ${isPending ? "text-amber-400" : "text-zinc-500"}`}>
        {isPending ? "Speichern..." : "Auto-Save"}
      </span>
    </div>
  );
}
