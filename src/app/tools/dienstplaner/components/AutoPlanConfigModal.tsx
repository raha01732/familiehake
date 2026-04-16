"use client";

import { useRef } from "react";

export type AutoPlanConfig = {
  month: string;
  min_shift_hours: number;
  max_shifts_per_week: number;
  skip_weekends: boolean;
  respect_availability: boolean;
  overwrite_existing: boolean;
};

type Props = {
  month: string;
  onClose: () => void;
  onConfirm: (config: AutoPlanConfig) => void;
  isPending: boolean;
};

const MONTH_LABELS: Record<string, string> = {
  "01": "Januar", "02": "Februar", "03": "März", "04": "April",
  "05": "Mai", "06": "Juni", "07": "Juli", "08": "August",
  "09": "September", "10": "Oktober", "11": "November", "12": "Dezember",
};

const inputCls =
  "w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)]";

export default function AutoPlanConfigModal({ month, onClose, onConfirm, isPending }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [, m, y] = ["", ...month.split("-")];
  const monthLabel = `${MONTH_LABELS[m] ?? m} ${y}`;

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    onConfirm({
      month,
      min_shift_hours: Number(fd.get("min_shift_hours") ?? 4),
      max_shifts_per_week: Number(fd.get("max_shifts_per_week") ?? 5),
      skip_weekends: fd.get("skip_weekends") === "on",
      respect_availability: fd.get("respect_availability") === "on",
      overwrite_existing: fd.get("overwrite_existing") === "on",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))]">
          <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary)/0.15)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-[hsl(var(--foreground))]">Auto-Plan konfigurieren</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{monthLabel}</p>
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

        <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Min shift length */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Mindestschichtlänge (Stunden)
            </label>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Schichten kürzer als dieser Wert werden nicht vergeben.</p>
            <input
              type="number"
              name="min_shift_hours"
              defaultValue={4}
              min={1}
              max={12}
              step={0.5}
              className={inputCls}
            />
          </div>

          {/* Max shifts per week */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Max. Schichten pro Woche (pro Mitarbeiter)
            </label>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">Damit kein Mitarbeiter zu viele Tage hintereinander eingeplant wird.</p>
            <input
              type="number"
              name="max_shifts_per_week"
              defaultValue={5}
              min={1}
              max={7}
              step={1}
              className={inputCls}
            />
          </div>

          {/* Toggle options */}
          <div className="space-y-3 pt-1">
            <ToggleRow
              name="respect_availability"
              defaultChecked
              label="Verfügbarkeit berücksichtigen"
              description="F (frei), K (krank) und Zeitpräferenzen werden beachtet."
            />
            <ToggleRow
              name="skip_weekends"
              defaultChecked={false}
              label="Wochenenden überspringen"
              description="Samstag und Sonntag werden nicht befüllt."
            />
            <ToggleRow
              name="overwrite_existing"
              defaultChecked={false}
              label="Vorhandene Schichten überschreiben"
              description="Bereits angelegte Schichten werden ersetzt. Sonst nur Lücken füllen."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-sm font-medium rounded-lg transition-all disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Plane …
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-Plan starten
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleRow({
  name, defaultChecked, label, description,
}: {
  name: string; defaultChecked: boolean; label: string; description: string;
}) {
  return (
    <label className="flex items-start gap-3 p-3 bg-[hsl(var(--secondary)/0.6)] hover:bg-[hsl(var(--secondary))] rounded-lg cursor-pointer transition-colors border border-[hsl(var(--border)/0.5)]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))] flex-shrink-0"
      />
      <div>
        <div className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{description}</div>
      </div>
    </label>
  );
}
