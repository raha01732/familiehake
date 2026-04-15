"use client";

import { useRef, useTransition, useState } from "react";
import type { Employee } from "../utils";
import { EMPLOYEE_COLORS, EMPLOYMENT_TYPES } from "../utils";

type Props = {
  employee?: Employee | null;
  onClose: () => void;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  isAdmin: boolean;
};

export default function EmployeeModal({
  employee,
  onClose,
  createAction,
  updateAction,
  deleteAction,
  isAdmin,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [selectedColor, setSelectedColor] = useState(employee?.color ?? EMPLOYEE_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(employee);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("color", selectedColor);
    startTransition(async () => {
      if (isEdit && employee) {
        fd.set("id", String(employee.id));
        await updateAction(fd);
      } else {
        await createAction(fd);
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!employee) return;
    const fd = new FormData();
    fd.set("id", String(employee.id));
    startDelete(async () => {
      await deleteAction(fd);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900 rounded-t-2xl">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 transition-colors"
            style={{ backgroundColor: selectedColor }}
          >
            {employee ? employee.name.slice(0, 2).toUpperCase() : "NM"}
          </div>
          <h2 className="font-semibold text-zinc-100">
            {isEdit ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={employee?.name ?? ""}
              placeholder="Vor- und Nachname"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
            />
          </div>

          {/* Position & Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Position / Rolle</label>
              <input
                type="text"
                name="position"
                defaultValue={employee?.position ?? ""}
                placeholder="z.B. Empfang"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Abteilung</label>
              <input
                type="text"
                name="department"
                defaultValue={employee?.department ?? ""}
                placeholder="z.B. Rezeption"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Employment type */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Beschäftigungsart</label>
            <select
              name="employment_type"
              defaultValue={employee?.employment_type ?? "vollzeit"}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Monatsstunden (Soll)</label>
              <input
                type="number"
                name="monthly_hours"
                defaultValue={employee?.monthly_hours ?? 160}
                min={0}
                max={744}
                step={0.5}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Wochenstunden (Soll)</label>
              <input
                type="number"
                name="weekly_hours"
                defaultValue={employee?.weekly_hours ?? 40}
                min={0}
                max={168}
                step={0.5}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Active status (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
              <input
                type="hidden"
                name="is_active"
                value={employee?.is_active ? "true" : "false"}
              />
              <label className="text-sm text-zinc-300">
                Mitarbeiter ist{" "}
                <span className={employee?.is_active ? "text-green-400" : "text-zinc-500"}>
                  {employee?.is_active ? "aktiv" : "inaktiv"}
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!formRef.current) return;
                  const hidden = formRef.current.querySelector<HTMLInputElement>('input[name="is_active"]');
                  if (hidden) hidden.value = hidden.value === "true" ? "false" : "true";
                  // Force re-render via form data
                }}
                className="ml-auto text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
              >
                Umschalten
              </button>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {EMPLOYEE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                  style={{ backgroundColor: c, outline: c === selectedColor ? `3px solid white` : "none", outlineOffset: "2px" }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isEdit && isAdmin && (
              confirmDelete ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-red-400">Wirklich löschen?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "…" : "Ja, löschen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-xs rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 text-sm rounded-lg transition-colors"
                >
                  Löschen
                </button>
              )
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
              {isPending ? "Speichern …" : isEdit ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
