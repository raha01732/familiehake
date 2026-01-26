// src/app/tools/dienstplaner/page.tsx
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import AvailabilityInput from "./AvailabilityInput";
import DayRequirementCell from "./DayRequirementCell";
import SettingsPanelToggle from "./SettingsPanelToggle";
import ShiftInput from "./ShiftInput";
import {
  bulkSaveShiftsAction,
  clearMonthAction,
  saveAvailabilityAction,
  saveShiftAction,
} from "./actions";
import {
  calculateShiftMinutes,
  formatDateLabel,
  formatMinutesAsHours,
  formatMonthLabel,
  type PauseRule,
} from "./utils";

export const metadata = { title: "Dienstplaner" };

type DienstplanEmployee = {
  id: number;
  name: string;
  position: string | null;
  monthly_hours: number;
  user_id: string | null;
};

type DienstplanShift = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
};

type DienstplanPauseRule = {
  id: number;
  min_minutes: number;
  pause_minutes: number;
};

type DienstplanAvailability = {
  employee_id: number;
  availability_date: string;
  status: string | null;
  fixed_start: string | null;
  fixed_end: string | null;
};

type WeekdayRequirement = {
  weekday: number;
  required_shifts: number;
};

type DateRequirement = {
  requirement_date: string;
  required_shifts: number;
};

type PositionRequirement = {
  requirement_date: string;
  position: string;
  start_time: string;
  end_time: string;
  note: string | null;
};

function getMonthFromSearch(searchParams?: { month?: string }) {
  const now = new Date();
  const param = searchParams?.month;
  if (!param) return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const [yearStr, monthStr] = param.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  return new Date(Date.UTC(year, monthIndex, 1));
}

function buildDaysInMonth(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const days: Date[] = [];
  for (let day = start.getUTCDate(); day <= end.getUTCDate(); day += 1) {
    days.push(new Date(Date.UTC(year, month, day)));
  }
  return { start, end, days };
}

export default async function DienstplanerPage({ searchParams }: { searchParams?: { month?: string } }) {
  const user = await currentUser();
  if (!user) {
    return <section className="p-6 text-zinc-400">Bitte melde dich an, um den Dienstplaner zu nutzen.</section>;
  }

  const role = (user.publicMetadata?.role as string | undefined)?.toLowerCase() || "user";
  const isAdmin = role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;

  const monthDate = getMonthFromSearch(searchParams);
  const { start, end, days } = buildDaysInMonth(monthDate);
  const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  const sb = createAdminClient();
  const { data: employees } = await sb.from("dienstplan_employees").select("*").order("name");
  const { data: shifts } = await sb
    .from("dienstplan_shifts")
    .select("employee_id, shift_date, start_time, end_time")
    .gte("shift_date", start.toISOString().slice(0, 10))
    .lte("shift_date", end.toISOString().slice(0, 10));
  const { data: availability } = await sb
    .from("dienstplan_availability")
    .select("employee_id, availability_date, status, fixed_start, fixed_end")
    .gte("availability_date", start.toISOString().slice(0, 10))
    .lte("availability_date", end.toISOString().slice(0, 10));
  const { data: pauseRules } = await sb
    .from("dienstplan_pause_rules")
    .select("id, min_minutes, pause_minutes")
    .order("min_minutes");
  const { data: weekdayRequirements } = await sb
    .from("dienstplan_weekday_requirements")
    .select("weekday, required_shifts");
  const { data: dateRequirements } = await sb
    .from("dienstplan_date_requirements")
    .select("requirement_date, required_shifts")
    .gte("requirement_date", start.toISOString().slice(0, 10))
    .lte("requirement_date", end.toISOString().slice(0, 10));
  const { data: positionRequirements } = await sb
    .from("dienstplan_position_requirements")
    .select("requirement_date, position, start_time, end_time, note")
    .gte("requirement_date", start.toISOString().slice(0, 10))
    .lte("requirement_date", end.toISOString().slice(0, 10))
    .order("start_time");

  const shiftMap = new Map<string, DienstplanShift>();
  for (const shift of (shifts as DienstplanShift[] | null) ?? []) {
    shiftMap.set(`${shift.employee_id}-${shift.shift_date}`, shift);
  }

  const availabilityMap = new Map<string, DienstplanAvailability>();
  for (const entry of (availability as DienstplanAvailability[] | null) ?? []) {
    availabilityMap.set(`${entry.employee_id}-${entry.availability_date}`, entry);
  }

  const pauseRuleList = ((pauseRules as DienstplanPauseRule[] | null) ?? []).map((rule) => ({
    min_minutes: rule.min_minutes,
    pause_minutes: rule.pause_minutes,
  })) satisfies PauseRule[];
  const employeeTotals = new Map<number, number>();
  for (const shift of (shifts as DienstplanShift[] | null) ?? []) {
    const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRuleList);
    if (!summary) continue;
    employeeTotals.set(shift.employee_id, (employeeTotals.get(shift.employee_id) ?? 0) + summary.workMinutes);
  }

  const prevMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const prevMonthKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextMonthKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;

  const weekdayRequirementMap = new Map<number, number>();
  for (const rule of (weekdayRequirements as WeekdayRequirement[] | null) ?? []) {
    weekdayRequirementMap.set(rule.weekday, rule.required_shifts);
  }

  const dateRequirementMap = new Map<string, number>();
  for (const rule of (dateRequirements as DateRequirement[] | null) ?? []) {
    dateRequirementMap.set(rule.requirement_date, rule.required_shifts);
  }

  const positionRequirementMap = new Map<string, PositionRequirement[]>();
  for (const requirement of (positionRequirements as PositionRequirement[] | null) ?? []) {
    const list = positionRequirementMap.get(requirement.requirement_date) ?? [];
    list.push(requirement);
    positionRequirementMap.set(requirement.requirement_date, list);
  }

  return (
    <section className="p-6 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Dienstplaner</h1>
            <p className="text-sm text-zinc-400">Monatsplanung für Schichten & Arbeitszeiten</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={{ pathname: "/tools/dienstplaner", query: { month: prevMonthKey } }}
              className="border border-zinc-700 rounded px-3 py-1 text-sm text-zinc-200 hover:border-zinc-500"
            >
              ← Vormonat
            </Link>
            <div className="text-sm text-zinc-300 font-medium">{formatMonthLabel(monthDate)}</div>
            <Link
              href={{ pathname: "/tools/dienstplaner", query: { month: nextMonthKey } }}
              className="border border-zinc-700 rounded px-3 py-1 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Nächster Monat →
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action={bulkSaveShiftsAction} id="bulk-save" className="flex items-center gap-3">
            <input type="hidden" name="month" value={monthKey} />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded"
            >
              Speichern
            </button>
          </form>
          <form action={clearMonthAction} className="flex items-center gap-3">
            <input type="hidden" name="month" value={monthKey} />
            <button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded"
            >
              Alles löschen
            </button>
          </form>
          {!isAdmin && (
            <span className="text-xs text-zinc-500">
              Du hast nur Lesezugriff auf Einstellungen (Admins können dort Regeln anpassen).
            </span>
          )}
        </div>
      </header>
      <SettingsPanelToggle
        employees={(employees as DienstplanEmployee[] | null) ?? []}
        pauseRules={(pauseRules as DienstplanPauseRule[] | null) ?? []}
        weekdayRequirements={(weekdayRequirements as WeekdayRequirement[] | null) ?? []}
        isAdmin={isAdmin}
      />

      <div className="overflow-x-auto border border-zinc-800 rounded-xl">
        <table className="min-w-max w-full text-sm text-zinc-200">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/60">
            <tr>
              <th className="py-3 px-4 text-left">Datum</th>
              <th className="py-3 px-4 text-left min-w-[260px]">Bemerkung/Bedarf</th>
              {(employees as DienstplanEmployee[] | null)?.map((employee) => (
                <th key={employee.id} className="py-3 px-4 text-left min-w-[160px]">
                  <div className="font-semibold text-zinc-100">{employee.name}</div>
                  <div className="text-[11px] text-zinc-500">{employee.position || "Position offen"}</div>
                  <div className="text-[11px] text-zinc-500">
                    Soll: {formatMinutesAsHours(Math.round(employee.monthly_hours * 60))}h / Monat
                  </div>
                </th>
              ))}
              <th className="py-3 px-4 text-left">Tagessumme</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateKey = day.toISOString().slice(0, 10);
              let dayTotalMinutes = 0;
              const requiredShifts =
                dateRequirementMap.get(dateKey) ?? weekdayRequirementMap.get(day.getUTCDay()) ?? 0;
              const positionRequirementsForDay = positionRequirementMap.get(dateKey) ?? [];

              return (
                <tr key={dateKey} className="border-t border-zinc-800 align-top">
                  <DayRequirementCell
                    dateKey={dateKey}
                    dateLabel={formatDateLabel(day)}
                    requiredShifts={requiredShifts}
                    positionRequirementsForDay={positionRequirementsForDay}
                  />
                  {(employees as DienstplanEmployee[] | null)?.map((employee) => {
                    const shift = shiftMap.get(`${employee.id}-${dateKey}`);
                    const availabilityEntry = availabilityMap.get(`${employee.id}-${dateKey}`);
                    const summary = calculateShiftMinutes(shift?.start_time ?? null, shift?.end_time ?? null, pauseRuleList);
                    if (summary) {
                      dayTotalMinutes += summary.workMinutes;
                    }

                    return (
                      <td key={`${employee.id}-${dateKey}`} className="py-3 px-4">
                        <AvailabilityInput
                          employeeId={employee.id}
                          date={dateKey}
                          initialStatus={availabilityEntry?.status ?? null}
                          initialFixedStart={availabilityEntry?.fixed_start ?? null}
                          initialFixedEnd={availabilityEntry?.fixed_end ?? null}
                          saveAction={saveAvailabilityAction}
                        />
                        <ShiftInput
                          baseName={`shift:${employee.id}:${dateKey}`}
                          label={`${employee.name} am ${dateKey}`}
                          initialStart={shift?.start_time ? shift.start_time.slice(0, 5) : ""}
                          initialEnd={shift?.end_time ? shift.end_time.slice(0, 5) : ""}
                          employeeId={employee.id}
                          date={dateKey}
                          formId="bulk-save"
                          saveAction={saveShiftAction}
                        />
                        {summary && (
                          <div className="text-[11px] text-zinc-500 mt-1">
                            {formatMinutesAsHours(summary.workMinutes)}h (Pause {summary.pauseMinutes}m)
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-4 text-zinc-400 text-xs whitespace-nowrap">
                    {dayTotalMinutes > 0 ? `${formatMinutesAsHours(dayTotalMinutes)}h` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-zinc-800 bg-zinc-900/60">
              <td className="py-3 px-4 text-zinc-300 font-medium">Monatssumme</td>
              <td className="py-3 px-4" />
              {(employees as DienstplanEmployee[] | null)?.map((employee) => {
                const totalMinutes = employeeTotals.get(employee.id) ?? 0;
                return (
                  <td key={`total-${employee.id}`} className="py-3 px-4 text-zinc-300 text-sm font-medium">
                    {totalMinutes > 0 ? `${formatMinutesAsHours(totalMinutes)}h` : "—"}
                  </td>
                );
              })}
              <td className="py-3 px-4" />
            </tr>
          </tbody>
        </table>
      </div>

      {((employees as DienstplanEmployee[] | null) ?? []).length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-300">
          Noch keine Mitarbeitenden angelegt. Lege sie oben in den Einstellungen an.
        </div>
      )}
    </section>
  );
}
