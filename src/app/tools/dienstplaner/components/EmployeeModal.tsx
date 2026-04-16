"use client";

import { useRef, useTransition, useState } from "react";
import type { Employee } from "../utils";
import { EMPLOYEE_COLORS, EMPLOYMENT_TYPES } from "../utils";

type Props = {
  employee?: Employee | null;
  onClose: () => void;
  createAction: (_fd: FormData) => Promise<void>;
  updateAction: (_fd: FormData) => Promise<void>;
  deleteAction: (_fd: FormData) => Promise<void>;
  isAdmin: boolean;
};

const inputCls =
  "w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] placeholder:text-[hsl(var(--muted-foreground)/0.6)]";

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

  function handleSubmit(e: { preventDefault: () => void }) {
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
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))] sticky top-0 bg-[hsl(var(--card))] rounded-t-2xl">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 transition-colors"
            style={{ backgroundColor: selectedColor }}
          >
            {employee ? employee.name.slice(0, 2).toUpperCase() : "NM"}
          </div>
          <h2 className="font-semibold text-[hsl(var(--foreground))]">
            {isEdit ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
              Name <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={employee?.name ?? ""}
              placeholder="Vor- und Nachname"
              className={inputCls}
            />
          </div>

          {/* Position & Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Position / Rolle</label>
              <input
                type="text"
                name="position"
                defaultValue={employee?.position ?? ""}
                placeholder="z.B. Empfang"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Abteilung</label>
              <input
                type="text"
                name="department"
                defaultValue={employee?.department ?? ""}
                placeholder="z.B. Rezeption"
                className={inputCls}
              />
            </div>
          </div>

          {/* Employment type */}
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Beschäftigungsart</label>
            <select
              name="employment_type"
              defaultValue={employee?.employment_type ?? "vollzeit"}
              className={inputCls}
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
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Monatsstunden (Soll)</label>
              <input
                type="number"
                name="monthly_hours"
                defaultValue={employee?.monthly_hours ?? 160}
                min={0}
                max={744}
                step={0.5}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1.5">Wochenstunden (Soll)</label>
              <input
                type="number"
                name="weekly_hours"
                defaultValue={employee?.weekly_hours ?? 40}
                min={0}
                max={168}
                step={0.5}
                className={inputCls}
              />
            </div>
          </div>

          {/* Active status (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-3 p-3 bg-[hsl(var(--secondary))] rounded-lg border border-[hsl(var(--border))]">
              <input
                type="hidden"
                name="is_active"
                value={employee?.is_active ? "true" : "false"}
              />
              <label className="text-sm text-[hsl(var(--foreground))]">
                Mitarbeiter ist{" "}
                <span className={employee?.is_active ? "text-[hsl(142_71%_45%)]" : "text-[hsl(var(--muted-foreground))]"}>
                  {employee?.is_active ? "aktiv" : "inaktiv"}
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!formRef.current) return;
                  const hidden = formRef.current.querySelector<HTMLInputElement>('input[name="is_active"]');
                  if (hidden) hidden.value = hidden.value === "true" ? "false" : "true";
                }}
                className="ml-auto text-xs px-3 py-1 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--border))] text-[hsl(var(--foreground))] rounded-md transition-colors"
              >
                Umschalten
              </button>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-2">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {EMPLOYEE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                  style={{ backgroundColor: c, outline: c === selectedColor ? `3px solid hsl(var(--ring))` : "none", outlineOffset: "2px" }}
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
                  <span className="text-xs text-[hsl(var(--destructive))]">Wirklich löschen?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 bg-[hsl(var(--destructive)/0.15)] hover:bg-[hsl(var(--destructive)/0.25)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "…" : "Ja, löschen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] text-xs rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive)/0.4)] text-[hsl(var(--destructive))] text-sm rounded-lg transition-colors"
                >
                  Löschen
                </button>
              )
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
              {isPending ? "Speichern …" : isEdit ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
