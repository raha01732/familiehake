"use client";

import { useMemo } from "react";
import PeriodsEditor from "../PeriodsEditor";
import ShiftRulesEditor from "../ShiftRulesEditor";
import {
  describePosition,
  slotsForDate,
  type DayRequirement,
  type RulePeriod,
  type ShiftRule,
} from "../requirements";

type Props = {
  month: string;
  days: string[];
  rules: ShiftRule[];
  periods: RulePeriod[];
  dayRequirements: DayRequirement[];
  /** false: Migration der Schichtregeln noch nicht ausgeführt */
  rulesAvailable: boolean;
  /** false: Migration der Zeiträume noch nicht ausgeführt */
  periodsAvailable: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const MONTH_LABELS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function formatShort(date: string) {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

export default function PreplanModal({
  month,
  days,
  rules,
  periods,
  dayRequirements,
  rulesAvailable,
  periodsAvailable,
  isPending,
  onClose,
  onConfirm,
}: Props) {
  const [year, monthNumber] = month.split("-");
  const monthLabel = `${MONTH_LABELS[Number(monthNumber) - 1] ?? monthNumber} ${year}`;

  // Vorschau: was würde die Vorplanung jetzt erzeugen?
  const preview = useMemo(() => {
    let total = 0;
    let daysWithoutDemand = 0;
    const byPeriod = new Map<number, { period: RulePeriod; days: number }>();
    let overriddenDays = 0;
    const byLabel = new Map<string, number>();
    for (const day of days) {
      const result = slotsForDate(day, rules, dayRequirements, periods);
      total += result.slots.length;
      if (result.slots.length === 0) daysWithoutDemand += 1;
      if (result.overridden) overriddenDays += 1;
      if (result.period) {
        const entry = byPeriod.get(result.period.id) ?? { period: result.period, days: 0 };
        entry.days += 1;
        byPeriod.set(result.period.id, entry);
      }
      for (const slot of result.slots) {
        const label = describePosition(slot.position, slot.require_leader);
        byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
      }
    }
    return {
      total,
      daysWithoutDemand,
      overriddenDays,
      periods: Array.from(byPeriod.values()),
      byLabel: Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [days, rules, periods, dayRequirements]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="font-semibold text-[hsl(var(--foreground))]">Vorplanung – {monthLabel}</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Regeln prüfen und anpassen, dann die offenen Slots für den Monat erzeugen.
            </p>
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

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {!rulesAvailable && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              Die Schichtregeln sind noch nicht eingerichtet. Bitte <code>dienstplaner-shift-rules-migration.sql</code>{" "}
              in Supabase ausführen.
            </div>
          )}

          {/* Vorschau */}
          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-4 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-bold tabular-nums text-[hsl(var(--foreground))]">{preview.total}</span>
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                Slots laut Regeln
                {preview.daysWithoutDemand > 0 && ` · ${preview.daysWithoutDemand} Tage ohne Bedarf`}
                {preview.overriddenDays > 0 && ` · ${preview.overriddenDays} Tage einzeln angepasst`}
              </span>
            </div>
            {preview.byLabel.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.byLabel.map(([label, count]) => (
                  <span
                    key={label}
                    className="rounded-md bg-[hsl(var(--background))] px-2 py-0.5 text-[11px] text-[hsl(var(--foreground))]"
                  >
                    {label} <span className="text-[hsl(var(--muted-foreground))]">×{count}</span>
                  </span>
                ))}
              </div>
            )}
            {preview.periods.map(({ period, days: count }) => (
              <p key={period.id} className="text-xs text-amber-500">
                Zeitraum „{period.name}“ ({formatShort(period.start_date)}–{formatShort(period.end_date)}) ersetzt
                die Standardregeln an {count} Tag{count === 1 ? "" : "en"}.
              </p>
            ))}
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Beim Start werden Slots, die schon durch eingetragene Schichten abgedeckt sind, nicht angelegt. Manuell
              angelegte Slots bleiben erhalten.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Standardregeln</h3>
            <ShiftRulesEditor rules={rules} isReadOnly={false} bare />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Abweichende Zeiträume (z. B. Ferien)
            </h3>
            <PeriodsEditor
              periods={periods}
              rules={rules}
              isReadOnly={false}
              month={month}
              available={periodsAvailable}
              bare
            />
          </section>
        </div>

        <div className="p-5 border-t border-[hsl(var(--border))] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || !rulesAvailable}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {isPending ? "Erstelle…" : `Vorplanung starten (${preview.total} Slots)`}
          </button>
        </div>
      </div>
    </div>
  );
}
