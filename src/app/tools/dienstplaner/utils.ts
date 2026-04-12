// /workspace/familiehake/src/app/tools/dienstplaner/utils.ts
export type PauseRule = {
  min_minutes: number;
  pause_minutes: number;
};

export type AutoPlanEmployee = {
  id: number;
  position: string | null;
  monthly_hours: number;
  weekly_hours: number;
};

export type AutoPlanShift = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
};

export type AutoPlanAvailability = {
  employee_id: number;
  availability_date: string;
  status: string | null;
  fixed_start: string | null;
  fixed_end: string | null;
};

export type AutoPlanSlot = {
  shift_date: string;
  position: string | null;
  start_time: string;
  end_time: string;
};

const MINUTES_PER_DAY = 24 * 60;
const SERVICELEITUNG_POSITION = "serviceleitung";

function parseTimeValue(value: string) {
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function calculateShiftMinutes(
  startTime: string | null,
  endTime: string | null,
  pauseRules: PauseRule[]
) {
  if (!startTime || !endTime) return null;

  const start = parseTimeValue(startTime.slice(0, 5));
  const end = parseTimeValue(endTime.slice(0, 5));
  if (!start || !end) return null;

  let durationMinutes = end.hours * 60 + end.minutes - (start.hours * 60 + start.minutes);
  if (durationMinutes < 0) {
    durationMinutes += 24 * 60;
  }

  const sortedRules = [...pauseRules].sort((a, b) => a.min_minutes - b.min_minutes);
  let pauseMinutes = 0;
  for (const rule of sortedRules) {
    if (durationMinutes >= rule.min_minutes) {
      pauseMinutes = rule.pause_minutes;
    }
  }

  const workMinutes = Math.max(durationMinutes - pauseMinutes, 0);
  return { durationMinutes, pauseMinutes, workMinutes };
}

export function formatMinutesAsHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function formatDateLabel(date: Date) {
  return date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function toMinutes(time: string) {
  const parsed = parseTimeValue(time.slice(0, 5));
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

function toTimeString(minutes: number) {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function addHoursToTime(time: string, hoursToAdd: number) {
  const timeInMinutes = toMinutes(time);
  if (timeInMinutes === null) return null;
  return toTimeString(timeInMinutes + hoursToAdd * 60);
}

export function getThursdayWeekKey(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = date.getUTCDay();
  const offsetToThursday = (weekday - 4 + 7) % 7;
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offsetToThursday));
  return thursday.toISOString().slice(0, 10);
}

function isTimeRangeCompatible(slotStart: string, slotEnd: string, fixedStart: string, fixedEnd: string) {
  const slotStartMinutes = toMinutes(slotStart);
  const slotEndMinutes = toMinutes(slotEnd);
  const fixedStartMinutes = toMinutes(fixedStart);
  const fixedEndMinutes = toMinutes(fixedEnd);
  if (
    slotStartMinutes === null ||
    slotEndMinutes === null ||
    fixedStartMinutes === null ||
    fixedEndMinutes === null
  ) {
    return false;
  }
  return fixedStartMinutes <= slotStartMinutes && fixedEndMinutes >= slotEndMinutes;
}

function calculatePreferencePenalty(status: string | null, startTime: string) {
  if (!status) return 0;
  const normalizedStatus = status.toLowerCase();
  const startMinutes = toMinutes(startTime);
  if (startMinutes === null) return 0;

  if (normalizedStatus === "fr" && startMinutes >= 15 * 60) return 12;
  if (normalizedStatus === "sp" && startMinutes <= 13 * 60) return 12;
  return 0;
}

export function generateAutoPlanSlots(params: {
  employees: AutoPlanEmployee[];
  existingShifts: AutoPlanShift[];
  availability: AutoPlanAvailability[];
  slots: AutoPlanSlot[];
  pauseRules: PauseRule[];
}) {
  const { employees, existingShifts, availability, slots, pauseRules } = params;
  const availabilityMap = new Map(
    availability.map((entry) => [`${entry.employee_id}-${entry.availability_date}`, entry])
  );
  const assignedByDay = new Map<string, Set<number>>();
  const totalMinutesByEmployee = new Map<number, number>();
  const weeklyMinutesByEmployee = new Map<string, number>();
  const assignmentCount = new Map<number, number>();

  for (const shift of existingShifts) {
    const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules);
    if (!summary) continue;
    totalMinutesByEmployee.set(
      shift.employee_id,
      (totalMinutesByEmployee.get(shift.employee_id) ?? 0) + summary.workMinutes
    );

    const weekKey = getThursdayWeekKey(shift.shift_date);
    if (weekKey) {
      weeklyMinutesByEmployee.set(
        `${shift.employee_id}-${weekKey}`,
        (weeklyMinutesByEmployee.get(`${shift.employee_id}-${weekKey}`) ?? 0) + summary.workMinutes
      );
    }
  }

  const plannedShifts: { employee_id: number; shift_date: string; start_time: string; end_time: string }[] = [];

  for (const slot of slots) {
    const assignedSet = assignedByDay.get(slot.shift_date) ?? new Set<number>();
    assignedByDay.set(slot.shift_date, assignedSet);
    let selectedEmployeeId: number | null = null;
    let selectedScore = Number.POSITIVE_INFINITY;

    for (const employee of employees) {
      if (assignedSet.has(employee.id)) continue;
      if (slot.position && employee.position && slot.position.toLowerCase() !== employee.position.toLowerCase()) {
        continue;
      }

      const availabilityEntry = availabilityMap.get(`${employee.id}-${slot.shift_date}`);
      const availabilityStatus = availabilityEntry?.status?.toLowerCase() ?? null;
      if (availabilityStatus === "f" || availabilityStatus === "k") continue;
      if (
        availabilityStatus === "fix" &&
        (!availabilityEntry?.fixed_start ||
          !availabilityEntry.fixed_end ||
          !isTimeRangeCompatible(slot.start_time, slot.end_time, availabilityEntry.fixed_start, availabilityEntry.fixed_end))
      ) {
        continue;
      }

      const currentMinutes = totalMinutesByEmployee.get(employee.id) ?? 0;
      const monthlyTargetMinutes = Math.max(0, Math.round(employee.monthly_hours * 60));
      const monthlyFairnessScore =
        monthlyTargetMinutes > 0 ? (currentMinutes / monthlyTargetMinutes) * 100 : currentMinutes / 60;
      const weekKey = getThursdayWeekKey(slot.shift_date);
      const weeklyTargetMinutes = Math.max(0, Math.round(employee.weekly_hours * 60));
      const weeklyMinutes = weekKey ? (weeklyMinutesByEmployee.get(`${employee.id}-${weekKey}`) ?? 0) : 0;
      const weeklyFairnessScore =
        weeklyTargetMinutes > 0 ? (weeklyMinutes / weeklyTargetMinutes) * 100 : weeklyMinutes / 60;
      const preferencePenalty = calculatePreferencePenalty(availabilityStatus, slot.start_time);
      const loadPenalty = (assignmentCount.get(employee.id) ?? 0) * 1.5;
      const combinedFairnessScore = monthlyFairnessScore * 0.6 + weeklyFairnessScore * 0.4;
      const score = combinedFairnessScore + preferencePenalty + loadPenalty;

      if (score < selectedScore) {
        selectedScore = score;
        selectedEmployeeId = employee.id;
      }
    }

    if (selectedEmployeeId === null) continue;

    const employee = employees.find((entry) => entry.id === selectedEmployeeId);
    const isServiceleitung = employee?.position?.trim().toLowerCase() === SERVICELEITUNG_POSITION;
    const startTime = slot.start_time;
    const endTime = isServiceleitung ? (addHoursToTime(startTime, 8) ?? slot.end_time) : slot.end_time;

    plannedShifts.push({
      employee_id: selectedEmployeeId,
      shift_date: slot.shift_date,
      start_time: startTime,
      end_time: endTime,
    });
    assignedSet.add(selectedEmployeeId);
    assignmentCount.set(selectedEmployeeId, (assignmentCount.get(selectedEmployeeId) ?? 0) + 1);
    const summary = calculateShiftMinutes(startTime, endTime, pauseRules);
    if (summary) {
      totalMinutesByEmployee.set(
        selectedEmployeeId,
        (totalMinutesByEmployee.get(selectedEmployeeId) ?? 0) + summary.workMinutes
      );
      const weekKey = getThursdayWeekKey(slot.shift_date);
      if (weekKey) {
        weeklyMinutesByEmployee.set(
          `${selectedEmployeeId}-${weekKey}`,
          (weeklyMinutesByEmployee.get(`${selectedEmployeeId}-${weekKey}`) ?? 0) + summary.workMinutes
        );
      }
    }
  }

  return plannedShifts;
}
