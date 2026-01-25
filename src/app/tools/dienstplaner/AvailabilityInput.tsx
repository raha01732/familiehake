// src/app/tools/dienstplaner/AvailabilityInput.tsx
"use client";

import { useState, useTransition } from "react";

type AvailabilityInputProps = {
  employeeId: number;
  date: string;
  initialStatus: string | null;
  initialFixedStart: string | null;
  initialFixedEnd: string | null;
  saveAction: (formData: FormData) => Promise<void>;
};

const AVAILABILITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "F", label: "F (Unverfügbar)" },
  { value: "K", label: "K (Krank)" },
  { value: "sp", label: "sp (Spät)" },
  { value: "fr", label: "fr (Früh)" },
  { value: "fix", label: "Fixe Zeiten" },
];

export default function AvailabilityInput({
  employeeId,
  date,
  initialStatus,
  initialFixedStart,
  initialFixedEnd,
  saveAction,
}: AvailabilityInputProps) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [fixedStart, setFixedStart] = useState(initialFixedStart ?? "");
  const [fixedEnd, setFixedEnd] = useState(initialFixedEnd ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSave = (nextStatus: string, nextStart: string, nextEnd: string) => {
    const formData = new FormData();
    formData.set("employee_id", String(employeeId));
    formData.set("availability_date", date);
    formData.set("status", nextStatus);
    formData.set("fixed_start", nextStart);
    formData.set("fixed_end", nextEnd);

    startTransition(() => {
      void saveAction(formData);
    });
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    if (value !== "fix") {
      setFixedStart("");
      setFixedEnd("");
      handleSave(value, "", "");
      return;
    }
    handleSave(value, fixedStart, fixedEnd);
  };

  const handleFixedBlur = (nextStart: string, nextEnd: string) => {
    handleSave(status, nextStart, nextEnd);
  };

  const showFixed = status === "fix";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(event) => handleStatusChange(event.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
          aria-label={`Verfügbarkeit ${employeeId} ${date}`}
        >
          {AVAILABILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={`text-[10px] ${isPending ? "text-amber-400" : "text-zinc-500"}`}>
          {isPending ? "Speichern..." : "Auto-Save"}
        </span>
      </div>
      {showFixed && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={fixedStart}
            onChange={(event) => setFixedStart(event.target.value)}
            onBlur={(event) => handleFixedBlur(event.target.value, fixedEnd)}
            className="w-20 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
            aria-label="Fixe Startzeit"
          />
          <span className="text-[11px] text-zinc-400">bis</span>
          <input
            type="time"
            value={fixedEnd}
            onChange={(event) => setFixedEnd(event.target.value)}
            onBlur={(event) => handleFixedBlur(fixedStart, event.target.value)}
            className="w-20 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 px-2 py-1 rounded"
            aria-label="Fixe Endzeit"
          />
        </div>
      )}
    </div>
  );
}
