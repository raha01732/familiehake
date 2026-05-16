// /workspace/familiehake/src/app/tools/dienstplaner/utils.ts

// ── Shared domain types ───────────────────────────────────────────────────────
export type PositionCategory = "serviceleitung" | "projektionsleitung" | "projektion";

export const POSITION_CATEGORIES: { value: PositionCategory; label: string }[] = [
  { value: "serviceleitung", label: "Serviceleitung" },
  { value: "projektionsleitung", label: "Projektionsleitung" },
  { value: "projektion", label: "Projektion" },
];

const POSITION_CATEGORY_ORDER: Record<PositionCategory | "_other", number> = {
  serviceleitung: 0,
  projektionsleitung: 1,
  projektion: 2,
  _other: 3,
};

export type Employee = {
  id: number;
  name: string;
  position: string | null;
  department: string | null;
  monthly_hours: number;
  weekly_hours: number;
  color: string;
  is_active: boolean;
  employment_type: string;
  sort_order: number;
  position_category: PositionCategory | null;
  allowed_positions?: PositionCategory[] | null;
  user_id?: string | null;
};

const POSITION_CATEGORY_VALUES = new Set<PositionCategory>([
  "serviceleitung",
  "projektionsleitung",
  "projektion",
]);

export function normalizeAllowedPositions(input: unknown): PositionCategory[] {
  if (!Array.isArray(input)) return [];
  const out: PositionCategory[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const v = value.trim().toLowerCase();
    if (POSITION_CATEGORY_VALUES.has(v as PositionCategory)) {
      out.push(v as PositionCategory);
    }
  }
  return Array.from(new Set(out));
}

/**
 * Leitet aus einem (oft Freitext-)Positionsnamen die Kategorie ab.
 * "Frühe Serviceleitung" → "serviceleitung"; unbekannt → null.
 */
export function inferPositionCategory(position: string | null | undefined): PositionCategory | null {
  if (!position) return null;
  const value = position.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("serviceleitung")) return "serviceleitung";
  if (value.includes("projektionsleitung")) return "projektionsleitung";
  if (value.includes("projektion")) return "projektion";
  if (POSITION_CATEGORY_VALUES.has(value as PositionCategory)) {
    return value as PositionCategory;
  }
  return null;
}

/**
 * Prüft, ob ein Mitarbeiter für eine Position freigeschaltet ist.
 * Unklare Positionen (null/keine Kategorie ableitbar) → erlaubt (legacy-tolerant).
 * Leeres allowed_positions-Array → für nichts freigeschaltet.
 */
export function isEmployeeAllowedForPosition(
  allowed: PositionCategory[] | null | undefined,
  positionRaw: string | null | undefined
): boolean {
  const category = inferPositionCategory(positionRaw);
  if (!category) return true;
  if (!allowed) return true;
  return allowed.includes(category);
}

export type DirectoryUser = {
  id: string;
  displayName: string;
};

export type SpecialEvent = {
  id: number;
  event_date: string;
  title: string;
  position: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

export type PlannedSlot = {
  id: number;
  slot_date: string;
  position: string | null;
  track_key: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
  source: string;
  assigned_employee_id: number | null;
};

export function sortEmployeesForGrid(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const ca = POSITION_CATEGORY_ORDER[a.position_category ?? "_other"];
    const cb = POSITION_CATEGORY_ORDER[b.position_category ?? "_other"];
    if (ca !== cb) return ca - cb;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name, "de");
  });
}

export type Shift = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  comment: string | null;
};

export type Availability = {
  employee_id: number;
  availability_date: string;
  status: string | null;
  fixed_start: string | null;
  fixed_end: string | null;
};

export type DateRequirement = {
  requirement_date: string;
  required_shifts: number;
  service_required_shifts: number | null;
  note: string | null;
};

export type ShiftTrack = {
  track_key: string;
  label: string;
  start_time: string;
  end_time: string;
};

export type EmploymentHourDefault = {
  employment_type: string;
  vacation_hours_per_day: number;
};

/** Wieviele Minuten Urlaub bekommt ein Mitarbeiter im aktuellen Monat angerechnet? */
export function calculateUrlaubMinutesByEmployee(
  availability: { employee_id: number; status: string | null }[],
  employees: { id: number; employment_type: string }[],
  defaults: { employment_type: string; vacation_hours_per_day: number }[]
): Map<number, number> {
  const defaultMap = new Map(defaults.map((d) => [d.employment_type, Number(d.vacation_hours_per_day) || 0]));
  const empType = new Map(employees.map((e) => [e.id, e.employment_type]));
  const result = new Map<number, number>();
  for (const entry of availability) {
    if ((entry.status ?? "").toLowerCase() !== "u") continue;
    const type = empType.get(entry.employee_id);
    if (!type) continue;
    const hpd = defaultMap.get(type) ?? 0;
    if (hpd <= 0) continue;
    result.set(entry.employee_id, (result.get(entry.employee_id) ?? 0) + hpd * 60);
  }
  return result;
}

export const EMPLOYEE_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#22c55e", "#06b6d4", "#eab308", "#ef4444",
  "#14b8a6", "#f43f5e",
];

export const EMPLOYMENT_TYPES = [
  { value: "vollzeit", label: "Vollzeit" },
  { value: "teilzeit", label: "Teilzeit" },
  { value: "minijob", label: "Minijob" },
  { value: "werkstudent", label: "Werkstudent" },
  { value: "praktikum", label: "Praktikum" },
];

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
}

export function getPrevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getNextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days: string[] = [];
  const end = new Date(Date.UTC(y, m, 0));
  for (let day = 1; day <= end.getUTCDate(); day++) {
    days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

// ── Legacy types kept for auto-plan algorithm ─────────────────────────────────
export type PauseRule = {
  min_minutes: number;
  pause_minutes: number;
};

export type AutoPlanEmployee = {
  id: number;
  position: string | null;
  monthly_hours: number;
  weekly_hours: number;
  allowed_positions?: PositionCategory[] | null;
  name?: string | null;
};

export type UnfilledSlotReport = {
  shift_date: string;
  position: string | null;
  start_time: string;
  end_time: string;
  reason: string;
};

export type AutoPlanResult = {
  plannedShifts: { employee_id: number; shift_date: string; start_time: string; end_time: string }[];
  unfilledSlots: UnfilledSlotReport[];
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
  pauseRules: PauseRule[],
  pauseOverrideMinutes?: number | null
) {
  if (!startTime || !endTime) return null;

  const start = parseTimeValue(startTime.slice(0, 5));
  const end = parseTimeValue(endTime.slice(0, 5));
  if (!start || !end) return null;

  let durationMinutes = end.hours * 60 + end.minutes - (start.hours * 60 + start.minutes);
  if (durationMinutes < 0) {
    durationMinutes += 24 * 60;
  }

  let pauseMinutes = 0;
  if (typeof pauseOverrideMinutes === "number" && pauseOverrideMinutes >= 0) {
    pauseMinutes = pauseOverrideMinutes;
  } else {
    const sortedRules = [...pauseRules].sort((a, b) => a.min_minutes - b.min_minutes);
    for (const rule of sortedRules) {
      if (durationMinutes >= rule.min_minutes) {
        pauseMinutes = rule.pause_minutes;
      }
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

// ── Feiertage (Niedersachsen-Set, deckt die für Braunschweig relevanten ab) ──
function easterSunday(year: number): Date {
  // Anonymous Gregorian Algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n));
}

/** Datum-String → Feiertagsname (für DE/NS). Leer wenn kein Feiertag. */
export function getGermanHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>();
  map.set(`${year}-01-01`, "Neujahr");
  const easter = easterSunday(year);
  map.set(dateKey(addUtcDays(easter, -2)), "Karfreitag");
  map.set(dateKey(addUtcDays(easter, 1)), "Ostermontag");
  map.set(dateKey(addUtcDays(easter, 39)), "Christi Himmelfahrt");
  map.set(dateKey(addUtcDays(easter, 50)), "Pfingstmontag");
  map.set(`${year}-05-01`, "Tag der Arbeit");
  map.set(`${year}-10-03`, "Tag der Deutschen Einheit");
  map.set(`${year}-10-31`, "Reformationstag");
  map.set(`${year}-12-25`, "1. Weihnachtstag");
  map.set(`${year}-12-26`, "2. Weihnachtstag");
  return map;
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

function addIsoDays(dateValue: string, n: number): string | null {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * Bewertet, wie gut das Hinzufügen einer Schicht am Tag `date` für den
 * Mitarbeiter zu den bisher zugewiesenen Tagen passt.
 * Niedrige (negative) Werte = besser, hohe = schlechter.
 *  - Reward, wenn der Tag direkt an einen bestehenden Schichttag anschließt
 *    (zusammenhängender Block).
 *  - Penalty, wenn dadurch ein „Schicht – Frei – Schicht“-Muster entsteht
 *    (also der Tag durch genau einen freien Tag von einer anderen Schicht
 *    getrennt wäre).
 */
function calculateBlockContinuityScore(
  workingDays: Set<string>,
  date: string
): number {
  const dayBefore = addIsoDays(date, -1);
  const dayAfter = addIsoDays(date, +1);
  const twoBefore = addIsoDays(date, -2);
  const twoAfter = addIsoDays(date, +2);

  const adjacentBefore = dayBefore !== null && workingDays.has(dayBefore);
  const adjacentAfter = dayAfter !== null && workingDays.has(dayAfter);
  const gapBefore =
    twoBefore !== null && dayBefore !== null && workingDays.has(twoBefore) && !workingDays.has(dayBefore);
  const gapAfter =
    twoAfter !== null && dayAfter !== null && workingDays.has(twoAfter) && !workingDays.has(dayAfter);

  let score = 0;
  // Bonus, wenn ein bestehender Block fortgesetzt wird.
  if (adjacentBefore && adjacentAfter) score -= 30; // Lücke füllen ist Premium
  else if (adjacentBefore || adjacentAfter) score -= 18;
  // Penalty pro entstandenem Schicht-Frei-Schicht-Pattern
  if (gapBefore) score += 25;
  if (gapAfter) score += 25;
  return score;
}

export function generateAutoPlanSlots(params: {
  employees: AutoPlanEmployee[];
  existingShifts: AutoPlanShift[];
  availability: AutoPlanAvailability[];
  slots: AutoPlanSlot[];
  pauseRules: PauseRule[];
  maxShiftsPerWeek?: number;
  /** Bereits angerechnete Minuten pro Mitarbeiter (z.B. Urlaubs-Minuten), bevor die Schichten verteilt werden. */
  extraMonthlyMinutesByEmployee?: Map<number, number>;
}): AutoPlanResult {
  const { employees, existingShifts, availability, slots, pauseRules, maxShiftsPerWeek = 7, extraMonthlyMinutesByEmployee } = params;
  const availabilityMap = new Map(
    availability.map((entry) => [`${entry.employee_id}-${entry.availability_date}`, entry])
  );
  const assignedByDay = new Map<string, Set<number>>();
  const totalMinutesByEmployee = new Map<number, number>();
  if (extraMonthlyMinutesByEmployee) {
    for (const [id, mins] of extraMonthlyMinutesByEmployee) {
      totalMinutesByEmployee.set(id, (totalMinutesByEmployee.get(id) ?? 0) + mins);
    }
  }
  const weeklyMinutesByEmployee = new Map<string, number>();
  const weeklyShiftCountByEmployee = new Map<string, number>();
  const assignmentCount = new Map<number, number>();
  // Set der Arbeitstage pro Mitarbeiter — für die Block-Kontinuitäts-Bewertung
  const workingDaysByEmployee = new Map<number, Set<string>>();
  for (const shift of existingShifts) {
    if (!shift.shift_date) continue;
    const set = workingDaysByEmployee.get(shift.employee_id) ?? new Set<string>();
    set.add(shift.shift_date);
    workingDaysByEmployee.set(shift.employee_id, set);
  }

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
      weeklyShiftCountByEmployee.set(
        `${shift.employee_id}-${weekKey}`,
        (weeklyShiftCountByEmployee.get(`${shift.employee_id}-${weekKey}`) ?? 0) + 1
      );
    }
  }

  const plannedShifts: { employee_id: number; shift_date: string; start_time: string; end_time: string }[] = [];
  const unfilledSlots: UnfilledSlotReport[] = [];

  // Slots chronologisch durchgehen, damit Block-Kontinuität sinnvoll greift.
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date);
    return a.start_time.localeCompare(b.start_time);
  });

  for (const slot of sortedSlots) {
    const assignedSet = assignedByDay.get(slot.shift_date) ?? new Set<number>();
    assignedByDay.set(slot.shift_date, assignedSet);
    let selectedEmployeeId: number | null = null;
    let selectedScore = Number.POSITIVE_INFINITY;
    let hadPositionMatch = false;
    let hadAnyEligible = false;

    const slotCategory = inferPositionCategory(slot.position);

    for (const employee of employees) {
      if (assignedSet.has(employee.id)) continue;
      // Strenger Filter: Mitarbeiter muss für die Slot-Position freigeschaltet sein
      if (slotCategory) {
        const allowed = employee.allowed_positions ?? null;
        if (allowed && !allowed.includes(slotCategory)) continue;
      }
      // Legacy-Strict-Match: wenn der Slot eine konkrete Position trägt und der
      // Mitarbeiter eine andere Standardposition hat, dann nur skippen, wenn beide
      // klar belegt sind und mismatch'en.
      if (
        slot.position &&
        employee.position &&
        slot.position.toLowerCase() !== employee.position.toLowerCase() &&
        !slotCategory
      ) {
        continue;
      }
      hadPositionMatch = true;

      const isServiceleitung = employee.position?.trim().toLowerCase() === SERVICELEITUNG_POSITION;
      const candidateEndTime = isServiceleitung ? (addHoursToTime(slot.start_time, 8) ?? slot.end_time) : slot.end_time;
      const availabilityEntry = availabilityMap.get(`${employee.id}-${slot.shift_date}`);
      const availabilityStatus = availabilityEntry?.status?.toLowerCase() ?? null;
      if (availabilityStatus === "f" || availabilityStatus === "k" || availabilityStatus === "u") continue;
      if (
        availabilityStatus === "fix" &&
        (!availabilityEntry?.fixed_start ||
          !availabilityEntry.fixed_end ||
          !isTimeRangeCompatible(slot.start_time, candidateEndTime, availabilityEntry.fixed_start, availabilityEntry.fixed_end))
      ) {
        continue;
      }

      const weekKey = getThursdayWeekKey(slot.shift_date);
      const weekShiftCount = weekKey
        ? (weeklyShiftCountByEmployee.get(`${employee.id}-${weekKey}`) ?? 0)
        : 0;
      if (weekShiftCount >= maxShiftsPerWeek) continue;

      hadAnyEligible = true;

      const currentMinutes = totalMinutesByEmployee.get(employee.id) ?? 0;
      const monthlyTargetMinutes = Math.max(0, Math.round(employee.monthly_hours * 60));
      const monthlyFairnessScore =
        monthlyTargetMinutes > 0 ? (currentMinutes / monthlyTargetMinutes) * 100 : currentMinutes / 60;
      const weeklyTargetMinutes = Math.max(0, Math.round(employee.weekly_hours * 60));
      const weeklyMinutes = weekKey ? (weeklyMinutesByEmployee.get(`${employee.id}-${weekKey}`) ?? 0) : 0;
      const weeklyFairnessScore =
        weeklyTargetMinutes > 0 ? (weeklyMinutes / weeklyTargetMinutes) * 100 : weeklyMinutes / 60;
      const preferencePenalty = calculatePreferencePenalty(availabilityStatus, slot.start_time);
      const loadPenalty = (assignmentCount.get(employee.id) ?? 0) * 1.5;
      const combinedFairnessScore = monthlyFairnessScore * 0.6 + weeklyFairnessScore * 0.4;
      const workingDays = workingDaysByEmployee.get(employee.id) ?? new Set<string>();
      const blockScore = calculateBlockContinuityScore(workingDays, slot.shift_date);
      const score = combinedFairnessScore + preferencePenalty + loadPenalty + blockScore;

      if (score < selectedScore) {
        selectedScore = score;
        selectedEmployeeId = employee.id;
      }
    }

    if (selectedEmployeeId === null) {
      let reason: string;
      if (!hadPositionMatch) {
        reason = slotCategory
          ? `Kein Mitarbeiter für Position "${slot.position ?? slotCategory}" freigeschaltet`
          : "Kein Mitarbeiter mit passender Position";
      } else if (!hadAnyEligible) {
        reason = "Alle passenden Mitarbeiter sind verhindert (Frei/Urlaub/Krank) oder am Wochenlimit";
      } else {
        reason = "Kein passender Mitarbeiter verfügbar";
      }
      unfilledSlots.push({
        shift_date: slot.shift_date,
        position: slot.position,
        start_time: slot.start_time,
        end_time: slot.end_time,
        reason,
      });
      continue;
    }

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
    const workingDays = workingDaysByEmployee.get(selectedEmployeeId) ?? new Set<string>();
    workingDays.add(slot.shift_date);
    workingDaysByEmployee.set(selectedEmployeeId, workingDays);
    const weekKeyForCount = getThursdayWeekKey(slot.shift_date);
    if (weekKeyForCount) {
      const countKey = `${selectedEmployeeId}-${weekKeyForCount}`;
      weeklyShiftCountByEmployee.set(countKey, (weeklyShiftCountByEmployee.get(countKey) ?? 0) + 1);
    }
    const summary = calculateShiftMinutes(startTime, endTime, pauseRules);
    if (summary) {
      totalMinutesByEmployee.set(
        selectedEmployeeId,
        (totalMinutesByEmployee.get(selectedEmployeeId) ?? 0) + summary.workMinutes
      );
      if (weekKeyForCount) {
        weeklyMinutesByEmployee.set(
          `${selectedEmployeeId}-${weekKeyForCount}`,
          (weeklyMinutesByEmployee.get(`${selectedEmployeeId}-${weekKeyForCount}`) ?? 0) + summary.workMinutes
        );
      }
    }
  }

  return { plannedShifts, unfilledSlots };
}
