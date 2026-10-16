"use client";

import { useRef } from "react";
import type { PlanningRules } from "@/lib/dienstplaner/planning-rules";

export type AutoPlanConfig = PlanningRules & {
  /** KI prüft den fertigen Plan und verbessert ihn in Runden */
  use_ai: boolean;
  ai_rounds: number;
};

type Props = {
  month: string;
  initial: AutoPlanConfig;
  aiEnabled: boolean;
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

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export default function AutoPlanConfigModal({ month, initial, aiEnabled, onClose, onConfirm, isPending }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [y, m] = month.split("-");
  const monthLabel = `${MONTH_LABELS[m] ?? m} ${y}`;

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    onConfirm({
      max_shifts_per_week: clamp(Number(fd.get("max_shifts_per_week")), 1, 7, initial.max_shifts_per_week),
      min_rest_hours: clamp(Number(fd.get("min_rest_hours")), 0, 24, initial.min_rest_hours),
      max_consecutive_days: clamp(Number(fd.get("max_consecutive_days")), 1, 14, initial.max_consecutive_days),
      use_ai: aiEnabled && fd.get("use_ai") === "on",
      ai_rounds: Math.round(clamp(Number(fd.get("ai_rounds")), 1, 5, initial.ai_rounds)),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="font-semibold text-[hsl(var(--foreground))]">Planungsregeln</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{monthLabel} · Standard aus den Einstellungen, gilt nur für diesen Lauf</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-5">
          <Field
            label="Max. Schichten pro Woche"
            hint="Pro Mitarbeiter, Woche Donnerstag bis Mittwoch."
            name="max_shifts_per_week"
            defaultValue={initial.max_shifts_per_week}
            min={1}
            max={7}
            step={1}
          />
          <Field
            label="Mindest-Ruhezeit (Stunden)"
            hint="Pause zwischen Schichtende und nächstem Schichtbeginn."
            name="min_rest_hours"
            defaultValue={initial.min_rest_hours}
            min={0}
            max={24}
            step={0.5}
          />
          <Field
            label="Max. Arbeitstage in Folge"
            hint="Danach wird mindestens ein freier Tag eingeplant."
            name="max_consecutive_days"
            defaultValue={initial.max_consecutive_days}
            min={1}
            max={14}
            step={1}
          />

          {aiEnabled && (
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] p-3 flex flex-col gap-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="use_ai"
                  defaultChecked={initial.use_ai}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="block text-sm font-medium text-[hsl(var(--foreground))]">
                    KI prüft und verbessert den Plan
                  </span>
                  <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                    Zuerst plant der Algorithmus regelbasiert. Danach schlägt die KI Verbesserungen vor (Soll-Stunden,
                    Lücken, offene Slots). Jede Änderung wird gegen alle harten Regeln geprüft und nur übernommen,
                    wenn der Plan messbar besser wird.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                Maximal
                <input
                  type="number"
                  name="ai_rounds"
                  min={1}
                  max={5}
                  step={1}
                  defaultValue={initial.ai_rounds}
                  className={`${inputCls} w-16 py-1`}
                />
                Verbesserungsrunden (stoppt früher, sobald keine Verbesserung mehr gefunden wird)
              </label>
            </div>
          )}

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
              className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {isPending ? "Plane …" : "Auto-Plan starten"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, hint, name, defaultValue, min, max, step,
}: {
  label: string; hint: string; name: string; defaultValue: number; min: number; max: number; step: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1" htmlFor={name}>
        {label}
      </label>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">{hint}</p>
      <input
        id={name}
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        className={inputCls}
      />
    </div>
  );
}
