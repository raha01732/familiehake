"use client";

import { useMemo } from "react";
import type { Employee, EmploymentHourDefault, Shift, Availability } from "../utils";
import {
  calculateShiftMinutes,
  calculateUrlaubMinutesByEmployee,
  formatMinutesAsHours,
  getInitials,
  type PauseRule,
} from "../utils";

type Props = {
  employee: Employee;
  month: string;
  shifts: Shift[];
  availability: Availability[];
  pauseRules: PauseRule[];
  employmentHourDefaults: EmploymentHourDefault[];
  onClose: () => void;
};

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")}.${String(
    d.getUTCMonth() + 1
  ).padStart(2, "0")}.`;
}

export default function EmployeeShiftSummaryModal({
  employee,
  month,
  shifts,
  availability,
  pauseRules,
  employmentHourDefaults,
  onClose,
}: Props) {
  const empShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.employee_id === employee.id)
        .sort((a, b) => a.shift_date.localeCompare(b.shift_date)),
    [shifts, employee.id]
  );

  const empAvailability = useMemo(
    () => availability.filter((a) => a.employee_id === employee.id),
    [availability, employee.id]
  );

  const shiftWorkMinutes = useMemo(
    () =>
      empShifts.reduce((sum, shift) => {
        const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules, shift.break_minutes);
        return sum + (summary?.workMinutes ?? 0);
      }, 0),
    [empShifts, pauseRules]
  );

  const urlaubMinutes = useMemo(() => {
    const map = calculateUrlaubMinutesByEmployee(availability, [employee], employmentHourDefaults);
    return map.get(employee.id) ?? 0;
  }, [availability, employee, employmentHourDefaults]);

  const totalWorkMinutes = shiftWorkMinutes + urlaubMinutes;
  const targetMinutes = (employee.monthly_hours ?? 0) * 60;
  const diffMinutes = totalWorkMinutes - targetMinutes;

  const urlaubDays = empAvailability.filter((a) => (a.status ?? "").toLowerCase() === "u").length;
  const krankDays = empAvailability.filter((a) => (a.status ?? "").toLowerCase() === "k").length;
  const freiDays = empAvailability.filter((a) => (a.status ?? "").toLowerCase() === "f").length;

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b border-[hsl(var(--border))]">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: employee.color }}
          >
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-[hsl(var(--foreground))] truncate">{employee.name}</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate capitalize">
              {employee.position ?? employee.position_category ?? "—"} · {monthLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-[hsl(var(--border))] text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Soll</div>
            <div className="font-semibold text-[hsl(var(--foreground))]">{employee.monthly_hours.toFixed(2)}h</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Ist</div>
            <div className="font-semibold text-[hsl(var(--foreground))]">
              {formatMinutesAsHours(totalWorkMinutes)}h
            </div>
            {urlaubMinutes > 0 && (
              <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                inkl. {formatMinutesAsHours(urlaubMinutes)}h Urlaub
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Differenz</div>
            <div
              className={`font-semibold ${
                diffMinutes < 0 ? "text-amber-500" : diffMinutes > 0 ? "text-emerald-500" : "text-[hsl(var(--foreground))]"
              }`}
            >
              {diffMinutes >= 0 ? "+" : ""}
              {formatMinutesAsHours(Math.abs(diffMinutes))}h
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Frei / Urlaub / Krank</div>
            <div className="font-semibold text-[hsl(var(--foreground))]">
              {freiDays} / {urlaubDays} / {krankDays}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {empShifts.length === 0 ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-8">
              Keine Schichten in {monthLabel}.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="text-left py-1 pr-2">Datum</th>
                  <th className="text-left py-1 px-2">Start</th>
                  <th className="text-left py-1 px-2">Ende</th>
                  <th className="text-right py-1 px-2">Stunden</th>
                  <th className="text-left py-1 pl-2">Notiz</th>
                </tr>
              </thead>
              <tbody className="text-[hsl(var(--foreground))]">
                {empShifts.map((shift) => {
                  const summary = calculateShiftMinutes(
                    shift.start_time,
                    shift.end_time,
                    pauseRules,
                    shift.break_minutes
                  );
                  return (
                    <tr key={shift.shift_date} className="border-t border-[hsl(var(--border))]/60">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{formatDay(shift.shift_date)}</td>
                      <td className="py-1.5 px-2">{shift.start_time?.slice(0, 5) ?? "—"}</td>
                      <td className="py-1.5 px-2">{shift.end_time?.slice(0, 5) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {summary ? formatMinutesAsHours(summary.workMinutes) : "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-[hsl(var(--muted-foreground))] truncate max-w-[200px]">
                        {shift.comment ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
