// /workspace/familiehake/src/app/tools/dienstplaner/page.tsx
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isPreviewEnvironment } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import AvailabilityInput from "./AvailabilityInput";
import DayRequirementCell from "./DayRequirementCell";
import SettingsPanelToggle from "./SettingsPanelToggle";
import ShiftInput from "./ShiftInput";
import {
  autoGenerateMonthPlanAction,
  bulkSaveShiftsAction,
  clearMonthAction,
  moveShiftAction,
  saveAvailabilityAction,
  saveShiftAction,
  updateShiftDetailsAction,
} from "./actions";
import {
  calculateShiftMinutes,
  formatDateLabel,
  formatMinutesAsHours,
  formatMonthLabel,
  getThursdayWeekKey,
  type PauseRule,
} from "./utils";

export const metadata = { title: "Dienstplaner" };

type DienstplanEmployee = {
  id: number;
  name: string;
  position: string | null;
  monthly_hours: number;
  weekly_hours: number;
  user_id: string | null;
};

type DienstplanShift = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  comment: string | null;
};

type WeeklyRangeShift = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
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

type ShiftTrack = {
  track_key: string;
  label: string;
  start_time: string;
  end_time: string;
};

type WeekdayPositionRequirement = {
  id: number;
  weekday: number;
  track_key: string;
  position: string;
  note: string | null;
};

type DateRequirement = {
  requirement_date: string;
  required_shifts: number;
  service_required_shifts: number | null;
  projection_required_shifts: number | null;
  note: string | null;
};

type PositionRequirement = {
  requirement_date: string;
  position: string;
  track_key: string | null;
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
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/dienstplaner"];
  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  const user = await currentUser();
  if (!user) {
    return <section className="p-6 text-zinc-400">Bitte melde dich an, um den Dienstplaner zu nutzen.</section>;
  }

  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isAdmin = role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;

  if (isPreviewEnvironment()) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Dienstplaner (Preview)"
          description="Schicht- und Mitarbeiterdaten sind in der Preview deaktiviert."
          fields={["Mitarbeiter", "Schichtplanung", "Verfügbarkeiten"]}
        />
      </section>
    );
  }

  const monthDate = getMonthFromSearch(searchParams);
  const { start, end, days } = buildDaysInMonth(monthDate);
  const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  const sb = createAdminClient();
  const { data: employees } = await sb.from("dienstplan_employees").select("*").order("name");
  const { data: shifts } = await sb
    .from("dienstplan_shifts")
    .select("employee_id, shift_date, start_time, end_time, break_minutes, comment")
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
    .select("requirement_date, required_shifts, service_required_shifts, projection_required_shifts, note")
    .gte("requirement_date", start.toISOString().slice(0, 10))
    .lte("requirement_date", end.toISOString().slice(0, 10));
  const { data: shiftTracks } = await sb
    .from("dienstplan_shift_tracks")
    .select("track_key, label, start_time, end_time")
    .order("track_key");
  const { data: weekdayPositionRequirements } = await sb
    .from("dienstplan_weekday_position_requirements")
    .select("id, weekday, track_key, position, note")
    .order("weekday")
    .order("track_key");
  const { data: positionRequirements } = await sb
    .from("dienstplan_position_requirements")
    .select("requirement_date, position, track_key, start_time, end_time, note")
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
  const weekGroups = new Map<string, string[]>();
  for (const day of days) {
    const dateKey = day.toISOString().slice(0, 10);
    const weekKey = getThursdayWeekKey(dateKey);
    if (!weekKey) continue;
    const group = weekGroups.get(weekKey) ?? [];
    group.push(dateKey);
    weekGroups.set(weekKey, group);
  }

  const employeeTotals = new Map<number, number>();
  for (const shift of (shifts as DienstplanShift[] | null) ?? []) {
    const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRuleList, shift.break_minutes);
    if (!summary) continue;
    employeeTotals.set(shift.employee_id, (employeeTotals.get(shift.employee_id) ?? 0) + summary.workMinutes);
  }

  const weekKeys = Array.from(weekGroups.keys()).sort();
  const firstWeekKey = weekKeys[0] ?? start.toISOString().slice(0, 10);
  const lastWeekKey = weekKeys[weekKeys.length - 1] ?? end.toISOString().slice(0, 10);
  const weeklyRangeEndDate = new Date(`${lastWeekKey}T00:00:00Z`);
  weeklyRangeEndDate.setUTCDate(weeklyRangeEndDate.getUTCDate() + 6);
  const weeklyRangeEnd = weeklyRangeEndDate.toISOString().slice(0, 10);

  const { data: weeklyRangeShifts } = await sb
    .from("dienstplan_shifts")
    .select("employee_id, shift_date, start_time, end_time, break_minutes")
    .gte("shift_date", firstWeekKey)
    .lte("shift_date", weeklyRangeEnd);

  const weeklyTotals = new Map<string, number>();
  for (const shift of (weeklyRangeShifts as WeeklyRangeShift[] | null) ?? []) {
    const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRuleList, shift.break_minutes);
    if (!summary) continue;
    const weekKey = getThursdayWeekKey(shift.shift_date);
    if (!weekKey) continue;
    weeklyTotals.set(`${shift.employee_id}-${weekKey}`, (weeklyTotals.get(`${shift.employee_id}-${weekKey}`) ?? 0) + summary.workMinutes);
  }

  const prevMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const prevMonthKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextMonthKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;

  const weekdayRequirementMap = new Map<number, number>();
  for (const rule of (weekdayRequirements as WeekdayRequirement[] | null) ?? []) {
    weekdayRequirementMap.set(rule.weekday, rule.required_shifts);
  }

  const dateRequirementMap = new Map<string, DateRequirement>();
  for (const rule of (dateRequirements as DateRequirement[] | null) ?? []) {
    dateRequirementMap.set(rule.requirement_date, rule);
  }

  const employeesOrdered = ((employees as DienstplanEmployee[] | null) ?? []).sort((left, right) => {
    const normalize = (position: string | null) => position?.trim().toLowerCase() ?? "";
    const leftPosition = normalize(left.position);
    const rightPosition = normalize(right.position);
    const rank = (position: string) => {
      if (position === "serviceleitung") return 0;
      if (position.includes("projektion")) return 2;
      return 1;
    };
    const rankDifference = rank(leftPosition) - rank(rightPosition);
    if (rankDifference !== 0) return rankDifference;
    return left.name.localeCompare(right.name, "de");
  });
  const firstProjectionIndex = employeesOrdered.findIndex((employee) =>
    (employee.position ?? "").trim().toLowerCase().includes("projektion")
  );

  const weekdayPositionRequirementMap = new Map<number, WeekdayPositionRequirement[]>();
  for (const requirement of (weekdayPositionRequirements as WeekdayPositionRequirement[] | null) ?? []) {
    const list = weekdayPositionRequirementMap.get(requirement.weekday) ?? [];
    list.push(requirement);
    weekdayPositionRequirementMap.set(requirement.weekday, list);
  }

  const positionRequirementMap = new Map<string, PositionRequirement[]>();
  for (const requirement of (positionRequirements as PositionRequirement[] | null) ?? []) {
    const list = positionRequirementMap.get(requirement.requirement_date) ?? [];
    list.push(requirement);
    positionRequirementMap.set(requirement.requirement_date, list);
  }

  let requiredSlotsMonth = 0;
  let assignedSlotsMonth = 0;
  for (const day of days) {
    const dateKey = day.toISOString().slice(0, 10);
    const positionRequirementsForDay = positionRequirementMap.get(dateKey) ?? [];
    if (positionRequirementsForDay.length > 0) {
      requiredSlotsMonth += positionRequirementsForDay.length;
    } else {
      requiredSlotsMonth += dateRequirementMap.get(dateKey)?.required_shifts ?? weekdayRequirementMap.get(day.getUTCDay()) ?? 0;
    }
    for (const employee of employeesOrdered) {
      if (shiftMap.has(`${employee.id}-${dateKey}`)) {
        assignedSlotsMonth += 1;
      }
    }
  }
  const coveragePercent = requiredSlotsMonth > 0 ? Math.min(100, Math.round((assignedSlotsMonth / requiredSlotsMonth) * 100)) : 100;

  return (
    <section className="p-6 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Dienstplaner</h1>
            <p className="text-sm text-zinc-400">Monatsplanung für Schichten, Rollen & automatische Einsatzvorschläge</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-cyan-900/60 bg-gradient-to-br from-cyan-950/60 to-zinc-900/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-cyan-300/80">Planabdeckung</div>
            <div className="text-xl font-semibold text-cyan-100">{coveragePercent}%</div>
          </div>
          <div className="rounded-xl border border-violet-900/60 bg-gradient-to-br from-violet-950/60 to-zinc-900/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-violet-300/80">Benötigte Slots</div>
            <div className="text-xl font-semibold text-violet-100">{requiredSlotsMonth}</div>
          </div>
          <div className="rounded-xl border border-emerald-900/60 bg-gradient-to-br from-emerald-950/60 to-zinc-900/80 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">Verplante Slots</div>
            <div className="text-xl font-semibold text-emerald-100">{assignedSlotsMonth}</div>
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
          {isAdmin && (
            <form action={autoGenerateMonthPlanAction} className="flex items-center gap-3">
              <input type="hidden" name="month" value={monthKey} />
              <button
                type="submit"
                className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded"
              >
                Auto-Plan erstellen
              </button>
            </form>
          )}
          {!isAdmin && (
            <span className="text-xs text-zinc-500">
              Du hast nur Lesezugriff auf Einstellungen und Automatisierung (Admins können Regeln und Auto-Planung anpassen).
            </span>
          )}
        </div>
      </header>
      <SettingsPanelToggle
        employees={(employees as DienstplanEmployee[] | null) ?? []}
        pauseRules={(pauseRules as DienstplanPauseRule[] | null) ?? []}
        weekdayRequirements={(weekdayRequirements as WeekdayRequirement[] | null) ?? []}
        shiftTracks={(shiftTracks as ShiftTrack[] | null) ?? []}
        weekdayPositionRequirements={(weekdayPositionRequirements as WeekdayPositionRequirement[] | null) ?? []}
        isAdmin={isAdmin}
      />

      <div className="overflow-x-auto border border-zinc-700 rounded-xl bg-zinc-950/70">
        <table className="min-w-max w-full text-sm text-zinc-100">
          <thead className="text-xs text-zinc-300 uppercase bg-zinc-900">
            <tr>
              <th className="py-3 pl-4 pr-2 text-left w-[190px]">Datum</th>
              <th className="py-3 pl-2 pr-4 text-left min-w-[220px]">Bemerkung/Bedarf</th>
              {employeesOrdered.map((employee, employeeIndex) => (
                <th
                  key={employee.id}
                  className={`py-3 px-4 text-left min-w-[160px] ${employeeIndex === firstProjectionIndex ? "border-l-4 border-black" : ""}`}
                >
                  <div className="font-semibold text-zinc-100">{employee.name}</div>
                  <div className="text-[11px] text-zinc-500">{employee.position || "Position offen"}</div>
                  <div className="text-[11px] text-zinc-500">
                    Soll: {formatMinutesAsHours(Math.round(employee.monthly_hours * 60))}h / Monat
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Soll: {formatMinutesAsHours(Math.round((employee.weekly_hours ?? 0) * 60))}h / Woche (Do-Mi)
                  </div>
                </th>
              ))}
                <th className="py-3 px-4 text-left text-zinc-100">Tagessumme</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateKey = day.toISOString().slice(0, 10);
              let dayTotalMinutes = 0;
              const dateRequirement = dateRequirementMap.get(dateKey);
              const requiredShifts = dateRequirement?.required_shifts ?? weekdayRequirementMap.get(day.getUTCDay()) ?? 0;
              const serviceRequiredShifts = dateRequirement?.service_required_shifts ?? 0;
              const projectionRequiredShifts = dateRequirement?.projection_required_shifts ?? 0;
              const positionRequirementsForDay = positionRequirementMap.get(dateKey) ?? [];
              const weekdayPositionDefaults = weekdayPositionRequirementMap.get(day.getUTCDay()) ?? [];

              return (
                <tr key={dateKey} className="border-t border-zinc-800 align-top">
                  <DayRequirementCell
                    dateKey={dateKey}
                    dateLabel={formatDateLabel(day)}
                    requiredShifts={requiredShifts}
                    serviceRequiredShifts={serviceRequiredShifts}
                    projectionRequiredShifts={projectionRequiredShifts}
                    note={dateRequirement?.note ?? null}
                    positionRequirementsForDay={positionRequirementsForDay}
                    shiftTracks={(shiftTracks as ShiftTrack[] | null) ?? []}
                    weekdayPositionRequirements={weekdayPositionDefaults}
                  />
                  {employeesOrdered.map((employee, employeeIndex) => {
                    const shift = shiftMap.get(`${employee.id}-${dateKey}`);
                    const availabilityEntry = availabilityMap.get(`${employee.id}-${dateKey}`);
                    const summary = calculateShiftMinutes(
                      shift?.start_time ?? null,
                      shift?.end_time ?? null,
                      pauseRuleList,
                      shift?.break_minutes ?? null
                    );
                    if (summary) {
                      dayTotalMinutes += summary.workMinutes;
                    }

                    return (
                      <td
                        key={`${employee.id}-${dateKey}`}
                        className={`py-3 px-4 ${employeeIndex === firstProjectionIndex ? "border-l-4 border-black" : ""}`}
                      >
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
                          isServiceleitung={employee.position?.trim().toLowerCase() === "serviceleitung"}
                          hasShift={Boolean(shift?.start_time && shift?.end_time)}
                          initialPauseMinutes={shift?.break_minutes ?? null}
                          initialComment={shift?.comment ?? null}
                          saveAction={saveShiftAction}
                          moveAction={moveShiftAction}
                          updateDetailsAction={updateShiftDetailsAction}
                        />
                        {summary && (
                          <div className="text-[11px] text-zinc-500 mt-1">
                            {formatMinutesAsHours(summary.workMinutes)}h (Pause {summary.pauseMinutes}m)
                          </div>
                        )}
                        {shift?.comment && <div className="mt-1 text-[11px] text-zinc-400">📝 {shift.comment}</div>}
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
              {employeesOrdered.map((employee, employeeIndex) => {
                const totalMinutes = employeeTotals.get(employee.id) ?? 0;
                return (
                  <td
                    key={`total-${employee.id}`}
                    className={`py-3 px-4 text-zinc-300 text-sm font-medium ${employeeIndex === firstProjectionIndex ? "border-l-4 border-black" : ""}`}
                  >
                    {totalMinutes > 0 ? `${formatMinutesAsHours(totalMinutes)}h` : "—"}
                  </td>
                );
              })}
              <td className="py-3 px-4" />
            </tr>
            {Array.from(weekGroups.entries()).map(([weekKey, weekDays]) => {
              const weekStart = new Date(`${weekKey}T00:00:00Z`);
              const weekEnd = new Date(`${weekDays[weekDays.length - 1]}T00:00:00Z`);
              const weekLabel = `Woche ${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}–${weekEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
              return (
                <tr key={`weekly-${weekKey}`} className="border-t border-zinc-800 bg-zinc-900/30">
                  <td className="py-2 px-4 text-zinc-300 text-xs">{weekLabel}</td>
                  <td className="py-2 px-4 text-zinc-500 text-xs">Wochensumme (Donnerstag–Mittwoch)</td>
                  {employeesOrdered.map((employee, employeeIndex) => {
                    const weeklyMinutes = weeklyTotals.get(`${employee.id}-${weekKey}`) ?? 0;
                    const weeklyTargetMinutes = Math.max(0, Math.round((employee.weekly_hours ?? 0) * 60));
                    return (
                      <td
                        key={`weekly-total-${employee.id}-${weekKey}`}
                        className={`py-2 px-4 text-xs text-zinc-300 ${employeeIndex === firstProjectionIndex ? "border-l-4 border-black" : ""}`}
                      >
                        {weeklyMinutes > 0 ? `${formatMinutesAsHours(weeklyMinutes)}h` : "—"}
                        {weeklyTargetMinutes > 0 && (
                          <span className="ml-1 text-zinc-500">/ {formatMinutesAsHours(weeklyTargetMinutes)}h</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 px-4" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {employeesOrdered.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-300">
          Noch keine Mitarbeitenden angelegt. Lege sie oben in den Einstellungen an.
        </div>
      )}
    </section>
  );
}
