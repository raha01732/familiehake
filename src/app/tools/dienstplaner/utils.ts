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
  /** Kann zusätzlich zur Hauptrolle Projektion in Personalunion übernehmen. */
  can_double_as_projektion?: boolean;
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
  positionRaw: string | null | undefined,
  requireLeader = false
): boolean {
  const category = inferPositionCategory(positionRaw);
  if (!category) return true;
  return isAllowedForCategory(allowed, category, requireLeader);
}

/**
 * Darf jemand mit diesen Freischaltungen eine Schicht der Kategorie übernehmen?
 * Bei „Projektion“ zählt die Projektionsleitung gleichwertig mit; mit `requireLeader`
 * (oder einer reinen Projektionsleitungs-Schicht) ist sie Pflicht.
 */
export function isAllowedForCategory(
  allowed: PositionCategory[] | null | undefined,
  category: PositionCategory,
  requireLeader = false
): boolean {
  if (!allowed) return true;
  if (category === "projektion") {
    if (allowed.includes("projektionsleitung")) return true;
    return !requireLeader && allowed.includes("projektion");
  }
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
  /** Nur Projektionsleitung darf diesen Slot besetzen. */
  require_leader?: boolean;
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
  /** Deckt diese Schicht zusätzlich die Projektion ab (Doppelrolle)? */
  covers_projektion?: boolean;
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
  slot_id?: number;
  require_leader?: boolean;
  shift_date: string;
  position: string | null;
  start_time: string;
  end_time: string;
  reason: string;
};

export type AutoPlanResult = {
  plannedShifts: { employee_id: number; shift_date: string; start_time: string; end_time: string; slot_id?: number }[];
  unfilledSlots: UnfilledSlotReport[];
  /** Planqualität, niedriger = besser (offene Slots, Abweichung vom Soll, Lücken, Wünsche). */
  score?: number;
  /** Nur im Prüfmodus (`fixedAssignments`): Vorgaben, die gegen harte Regeln verstoßen. */
  rejected?: { slot_id: number; employee_id: number; reason: string }[];
};

export type AutoPlanShift = {
  /**
   * Schicht außerhalb des zu planenden Monats (Nachbarmonat): zählt für Ruhezeit,
   * Tage in Folge und Wochenlimit, aber nicht für die Monatsstunden.
   */
  context?: boolean;
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
  /** Optionale Kennung (z.B. planned_slots.id) – wird in Ergebnis und Report durchgereicht. */
  id?: number;
  /** Nur Projektionsleitung darf diesen Slot übernehmen. */
  require_leader?: boolean;
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

type BlockContinuityScore = {
  /** Bonus (negativ) fürs Fortsetzen eines Blocks — nur gewähren, solange
   *  der Mitarbeiter noch nicht über seinem Soll liegt (siehe Aufrufer). */
  continuityBonus: number;
  /** Penalty (positiv) für ein „Schicht – Frei – Schicht“-Muster — gilt
   *  unabhängig von der Auslastung, da das reine Planqualität betrifft. */
  gapPenalty: number;
};

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
): BlockContinuityScore {
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

  let continuityBonus = 0;
  if (adjacentBefore && adjacentAfter) continuityBonus = -30; // Lücke füllen ist Premium
  else if (adjacentBefore || adjacentAfter) continuityBonus = -18;
  let gapPenalty = 0;
  if (gapBefore) gapPenalty += 25;
  if (gapAfter) gapPenalty += 25;
  return { continuityBonus, gapPenalty };
}


// ── Auto-Planung ──────────────────────────────────────────────────────────────
export const DEFAULT_MIN_REST_MINUTES = 11 * 60;
export const DEFAULT_MAX_CONSECUTIVE_DAYS = 6;

type BlockReason = "position" | "availability" | "sameDay" | "weekLimit" | "rest" | "consecutive";

type PlannerAssignment = {
  date: string;
  day: number;
  startAbs: number;
  endAbs: number;
  workMinutes: number;
  /** null = bereits bestehende (unveränderliche) Schicht */
  slotIndex: number | null;
  /** true = Nachbarmonat, zählt nicht für das Monatssoll */
  context: boolean;
  start: string;
  end: string;
};

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/**
 * Verteilt offene Slots auf Mitarbeitende.
 *
 * Harte Regeln (nie verletzt): Position/Freischaltung, Frei/Urlaub/Krank,
 * feste Zeitfenster, max. eine Schicht pro Tag (inkl. bestehender Schichten),
 * Wochenlimit, Mindest-Ruhezeit zwischen Schichten, max. Tage in Folge.
 *
 * Weiche Regeln (Score): Soll-Stunden-Fairness, Früh/Spät-Wunsch, zusammen-
 * hängende Blöcke statt „Schicht-Frei-Schicht“, Überstunden-Strafe.
 *
 * Vorgehen: Engpass-Slots (wenige mögliche Mitarbeitende) zuerst, danach
 * chronologisch greedy; übrig gebliebene Slots werden per Umbuchung
 * (eine bestehende Zuweisung weicht auf eine andere Person aus) repariert.
 */
export function generateAutoPlanSlots(params: {
  employees: AutoPlanEmployee[];
  existingShifts: AutoPlanShift[];
  availability: AutoPlanAvailability[];
  slots: AutoPlanSlot[];
  pauseRules: PauseRule[];
  maxShiftsPerWeek?: number;
  minRestMinutes?: number;
  maxConsecutiveDays?: number;
  /** Bereits angerechnete Minuten pro Mitarbeiter (z.B. Urlaubs-Minuten), bevor die Schichten verteilt werden. */
  extraMonthlyMinutesByEmployee?: Map<number, number>;
  /**
   * Prüfmodus: statt selbst zu planen, werden diese Zuweisungen (Slot-ID → Mitarbeiter) gegen alle
   * harten Regeln geprüft und bewertet. Regelverstöße landen in `rejected`.
   */
  fixedAssignments?: { slot_id: number; employee_id: number }[];
}): AutoPlanResult {
  const {
    employees,
    existingShifts,
    availability,
    slots,
    pauseRules,
    maxShiftsPerWeek = 7,
    minRestMinutes = DEFAULT_MIN_REST_MINUTES,
    maxConsecutiveDays = DEFAULT_MAX_CONSECUTIVE_DAYS,
    extraMonthlyMinutesByEmployee,
    fixedAssignments,
  } = params;

  const availabilityMap = new Map(
    availability.map((entry) => [`${entry.employee_id}-${entry.availability_date}`, entry])
  );

  const sortedSlots = [...slots].sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date);
    return a.start_time.localeCompare(b.start_time);
  });

  const byEmployee = new Map<number, PlannerAssignment[]>();
  for (const employee of employees) byEmployee.set(employee.id, []);

  function buildAssignment(
    date: string,
    start: string | null,
    end: string | null,
    slotIndex: number | null,
    context = false
  ): PlannerAssignment {
    const day = dayNumber(date);
    const summary = calculateShiftMinutes(start, end, pauseRules);
    const startMin = (start && toMinutes(start)) || 0;
    const duration = summary?.durationMinutes ?? 0;
    return {
      date,
      day,
      startAbs: day * MINUTES_PER_DAY + startMin,
      endAbs: day * MINUTES_PER_DAY + startMin + duration,
      workMinutes: summary?.workMinutes ?? 0,
      slotIndex,
      context,
      start: start ?? "",
      end: end ?? "",
    };
  }

  for (const shift of existingShifts) {
    if (!shift.shift_date) continue;
    const list = byEmployee.get(shift.employee_id);
    if (!list) continue;
    list.push(
      buildAssignment(shift.shift_date, shift.start_time?.slice(0, 5) ?? null, shift.end_time?.slice(0, 5) ?? null, null, shift.context === true)
    );
  }

  const newCount = new Map<number, number>();

  function slotTimesFor(employee: AutoPlanEmployee, slot: AutoPlanSlot) {
    const isServiceleitung = employee.position?.trim().toLowerCase() === SERVICELEITUNG_POSITION;
    const end = isServiceleitung ? (addHoursToTime(slot.start_time, 8) ?? slot.end_time) : slot.end_time;
    return { start: slot.start_time, end };
  }

  /** Positions- und Verfügbarkeitsprüfung (ändert sich im Verlauf der Planung nicht). */
  function staticBlock(employee: AutoPlanEmployee, slot: AutoPlanSlot): BlockReason | null {
    const slotCategory = inferPositionCategory(slot.position);
    if (slotCategory) {
      if (!isAllowedForCategory(employee.allowed_positions ?? null, slotCategory, slot.require_leader === true)) {
        return "position";
      }
    } else if (
      slot.position &&
      employee.position &&
      slot.position.toLowerCase() !== employee.position.toLowerCase()
    ) {
      return "position";
    }
    const entry = availabilityMap.get(`${employee.id}-${slot.shift_date}`);
    const status = entry?.status?.toLowerCase() ?? null;
    if (status === "f" || status === "k" || status === "u") return "availability";
    if (status === "fix") {
      const times = slotTimesFor(employee, slot);
      if (
        !entry?.fixed_start ||
        !entry.fixed_end ||
        !isTimeRangeCompatible(times.start, times.end, entry.fixed_start, entry.fixed_end)
      ) {
        return "availability";
      }
    }
    return null;
  }

  function listWithout(employeeId: number, ignoreSlotIndex: number | null) {
    return (byEmployee.get(employeeId) ?? []).filter(
      (a) => ignoreSlotIndex === null || a.slotIndex !== ignoreSlotIndex
    );
  }

  /** Dynamische harte Regeln gegen den aktuellen Zwischenstand. */
  function dynamicBlock(
    employee: AutoPlanEmployee,
    slot: AutoPlanSlot,
    ignoreSlotIndex: number | null
  ): BlockReason | null {
    const list = listWithout(employee.id, ignoreSlotIndex);
    const times = slotTimesFor(employee, slot);
    const candidate = buildAssignment(slot.shift_date, times.start, times.end, -1);

    if (list.some((a) => a.date === slot.shift_date)) return "sameDay";

    const weekKey = getThursdayWeekKey(slot.shift_date);
    if (weekKey && list.filter((a) => getThursdayWeekKey(a.date) === weekKey).length >= maxShiftsPerWeek) {
      return "weekLimit";
    }

    for (const other of list) {
      if (other.day === candidate.day - 1 || other.day === candidate.day + 1) {
        const gap = other.day < candidate.day ? candidate.startAbs - other.endAbs : other.startAbs - candidate.endAbs;
        if (gap < minRestMinutes) return "rest";
      }
    }

    const days = new Set(list.map((a) => a.day));
    let run = 1;
    for (let d = candidate.day - 1; days.has(d); d--) run += 1;
    for (let d = candidate.day + 1; days.has(d); d++) run += 1;
    if (run > maxConsecutiveDays) return "consecutive";
    return null;
  }

  function scoreFor(employee: AutoPlanEmployee, slot: AutoPlanSlot): number {
    const list = listWithout(employee.id, null);
    const weekKey = getThursdayWeekKey(slot.shift_date);
    const currentMinutes =
      (extraMonthlyMinutesByEmployee?.get(employee.id) ?? 0) + list.reduce((sum, a) => sum + (a.context ? 0 : a.workMinutes), 0);
    const weeklyMinutes = weekKey
      ? list.filter((a) => getThursdayWeekKey(a.date) === weekKey).reduce((sum, a) => sum + a.workMinutes, 0)
      : 0;

    const monthlyTarget = Math.max(0, Math.round(employee.monthly_hours * 60));
    const weeklyTarget = Math.max(0, Math.round(employee.weekly_hours * 60));
    const monthlyFairness = monthlyTarget > 0 ? (currentMinutes / monthlyTarget) * 100 : currentMinutes / 60;
    const weeklyFairness = weeklyTarget > 0 ? (weeklyMinutes / weeklyTarget) * 100 : weeklyMinutes / 60;

    const times = slotTimesFor(employee, slot);
    const shiftMinutes = calculateShiftMinutes(times.start, times.end, pauseRules)?.workMinutes ?? 0;
    // Überstunden: deutlich teurer, sobald das Monatssoll durch diese Schicht überschritten würde
    const overtimePenalty =
      monthlyTarget > 0 && currentMinutes + shiftMinutes > monthlyTarget
        ? 40 + ((currentMinutes + shiftMinutes - monthlyTarget) / monthlyTarget) * 200
        : 0;

    const status = availabilityMap.get(`${employee.id}-${slot.shift_date}`)?.status ?? null;
    const preferencePenalty = calculatePreferencePenalty(status?.toLowerCase() ?? null, slot.start_time);
    const loadPenalty = (newCount.get(employee.id) ?? 0) * 1.5;
    const { continuityBonus, gapPenalty } = calculateBlockContinuityScore(
      new Set(list.map((a) => a.date)),
      slot.shift_date
    );
    // Kontinuitäts-Bonus nur, solange das Monats-/Wochensoll noch nicht erreicht ist -
    // sonst würde ein ohnehin überlasteter Mitarbeiter weiter bevorzugt.
    const alreadyAtOrOverTarget = monthlyFairness >= 100 || weeklyFairness >= 100;
    const blockScore = (alreadyAtOrOverTarget ? 0 : continuityBonus) + gapPenalty;
    return monthlyFairness * 0.6 + weeklyFairness * 0.4 + preferencePenalty + loadPenalty + blockScore + overtimePenalty;
  }

  function place(employee: AutoPlanEmployee, slot: AutoPlanSlot, slotIndex: number) {
    const times = slotTimesFor(employee, slot);
    byEmployee.get(employee.id)?.push(buildAssignment(slot.shift_date, times.start, times.end, slotIndex));
    newCount.set(employee.id, (newCount.get(employee.id) ?? 0) + 1);
  }

  function unplace(employeeId: number, slotIndex: number) {
    const list = byEmployee.get(employeeId);
    if (!list) return;
    const at = list.findIndex((a) => a.slotIndex === slotIndex);
    if (at >= 0) list.splice(at, 1);
    newCount.set(employeeId, Math.max(0, (newCount.get(employeeId) ?? 1) - 1));
  }

  function bestEmployeeFor(slotIndex: number, exclude?: number): AutoPlanEmployee | null {
    const slot = sortedSlots[slotIndex];
    let best: AutoPlanEmployee | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const employee of employees) {
      if (employee.id === exclude) continue;
      if (staticBlock(employee, slot) || dynamicBlock(employee, slot, null)) continue;
      const score = scoreFor(employee, slot);
      if (score < bestScore) {
        best = employee;
        bestScore = score;
      }
    }
    return best;
  }

  // Engpass-Slots zuerst (≤ 2 mögliche Personen), dann chronologisch
  const eligibleCounts = sortedSlots.map(
    (slot) => employees.filter((employee) => staticBlock(employee, slot) === null).length
  );
  const order = sortedSlots.map((_, index) => index);
  // Reihenfolge: Leitungs-Pflicht zuerst (sonst belegen Projektions-Slots die wenigen Leitungen), dann Engpässe
  const priority = (index: number) =>
    sortedSlots[index].require_leader ? 0 : eligibleCounts[index] <= 2 ? 1 : 2;
  order.sort((a, b) => {
    const diff = priority(a) - priority(b);
    return diff !== 0 ? diff : a - b;
  });

  const REASON_LABEL: Record<Exclude<BlockReason, "position">, string> = {
    availability: "Frei/Urlaub/Krank/Zeitfenster",
    sameDay: "am Tag schon eingeplant",
    weekLimit: "Wochenlimit erreicht",
    rest: `Ruhezeit unter ${Math.round(minRestMinutes / 60)} h`,
    consecutive: `mehr als ${maxConsecutiveDays} Tage in Folge`,
  };

  const placement = new Map<number, number>(); // slotIndex → employeeId
  const open: number[] = [];
  const stillOpen: number[] = [];
  const rejected: NonNullable<AutoPlanResult["rejected"]> = [];
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

  if (fixedAssignments) {
    // Prüfmodus: Vorgaben chronologisch einsetzen, Regelverstöße aussortieren
    const fixedBySlot = new Map<number, number>();
    for (const entry of fixedAssignments) fixedBySlot.set(entry.slot_id, entry.employee_id);
    sortedSlots.forEach((slot, slotIndex) => {
      const employeeId = slot.id === undefined ? undefined : fixedBySlot.get(slot.id);
      if (employeeId === undefined) {
        stillOpen.push(slotIndex);
        return;
      }
      const employee = employeesById.get(employeeId);
      const blocked = employee ? (staticBlock(employee, slot) ?? dynamicBlock(employee, slot, null)) : "position";
      if (!employee || blocked) {
        rejected.push({
          slot_id: slot.id as number,
          employee_id: employeeId,
          reason: blocked && blocked !== "position" ? REASON_LABEL[blocked] : "Position nicht freigeschaltet",
        });
        stillOpen.push(slotIndex);
        return;
      }
      place(employee, slot, slotIndex);
      placement.set(slotIndex, employee.id);
    });
  } else {

    for (const slotIndex of order) {
      const chosen = bestEmployeeFor(slotIndex);
      if (!chosen) {
        open.push(slotIndex);
        continue;
      }
      place(chosen, sortedSlots[slotIndex], slotIndex);
      placement.set(slotIndex, chosen.id);
    }

    // Reparatur: offenen Slot besetzen, indem eine bestehende Zuweisung auf jemand anderen ausweicht
    for (const slotIndex of open) {
      const slot = sortedSlots[slotIndex];
      let repaired = false;
      for (const employee of employees) {
        if (repaired) break;
        if (staticBlock(employee, slot)) continue;
        const movable = (byEmployee.get(employee.id) ?? []).filter((a) => a.slotIndex !== null);
        for (const blocking of movable) {
          const movedIndex = blocking.slotIndex as number;
          if (dynamicBlock(employee, slot, movedIndex)) continue;
          const replacement = bestEmployeeFor(movedIndex, employee.id);
          if (!replacement) continue;
          unplace(employee.id, movedIndex);
          place(replacement, sortedSlots[movedIndex], movedIndex);
          placement.set(movedIndex, replacement.id);
          place(employee, slot, slotIndex);
          placement.set(slotIndex, employee.id);
          repaired = true;
          break;
        }
      }
      if (!repaired) stillOpen.push(slotIndex);
    }

    // Feinschliff: Zuweisungen auf deutlich besser passende Personen umlegen (Fairness/Blöcke)
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const [slotIndex, currentId] of [...placement.entries()]) {
        const current = employeesById.get(currentId);
        if (!current) continue;
        const slot = sortedSlots[slotIndex];
        unplace(currentId, slotIndex);
        let best = current;
        let bestScore = scoreFor(current, slot);
        for (const candidate of employees) {
          if (candidate.id === currentId) continue;
          if (staticBlock(candidate, slot) || dynamicBlock(candidate, slot, null)) continue;
          const candidateScore = scoreFor(candidate, slot);
          if (candidateScore < bestScore - 8) {
            best = candidate;
            bestScore = candidateScore;
          }
        }
        place(best, slot, slotIndex);
        placement.set(slotIndex, best.id);
        if (best.id !== currentId) moved = true;
      }
      if (!moved) break;
    }

  }

  const unfilledSlots: UnfilledSlotReport[] = [...stillOpen]
    .sort((a, b) => a - b)
    .map((slotIndex) => {
      const slot = sortedSlots[slotIndex];
      const counts = new Map<BlockReason, number>();
      let positionMatches = 0;
      for (const employee of employees) {
        const blocked = staticBlock(employee, slot) ?? dynamicBlock(employee, slot, null);
        if (!blocked) continue;
        counts.set(blocked, (counts.get(blocked) ?? 0) + 1);
        if (blocked !== "position") positionMatches += 1;
      }
      let reason: string;
      if (positionMatches === 0) {
        const category = inferPositionCategory(slot.position);
        reason = slot.require_leader
          ? "Kein Mitarbeiter als Projektionsleitung freigeschaltet"
          : category
            ? `Kein Mitarbeiter für Position "${slot.position ?? category}" freigeschaltet`
            : "Kein Mitarbeiter mit passender Position";
      } else {
        const parts = (Object.keys(REASON_LABEL) as (keyof typeof REASON_LABEL)[])
          .filter((key) => counts.has(key))
          .map((key) => `${counts.get(key)}× ${REASON_LABEL[key]}`);
        reason = `Alle passenden Mitarbeiter blockiert: ${parts.join(", ")}`;
      }
      return {
        slot_id: slot.id,
        require_leader: slot.require_leader === true,
        shift_date: slot.shift_date,
        position: slot.position,
        start_time: slot.start_time,
        end_time: slot.end_time,
        reason,
      };
    });

  const plannedShifts: AutoPlanResult["plannedShifts"] = [];
  for (const [slotIndex, employeeId] of [...placement.entries()].sort((a, b) => a[0] - b[0])) {
    const assignment = byEmployee.get(employeeId)?.find((a) => a.slotIndex === slotIndex);
    if (!assignment) continue;
    plannedShifts.push({
      employee_id: employeeId,
      shift_date: assignment.date,
      start_time: assignment.start,
      end_time: assignment.end,
      slot_id: sortedSlots[slotIndex].id,
    });
  }

  // Planqualität (niedriger = besser)
  let score = unfilledSlots.length * 1000;
  for (const employee of employees) {
    const list = byEmployee.get(employee.id) ?? [];
    const target = Math.max(0, Math.round(employee.monthly_hours * 60));
    if (target > 0) {
      const minutes =
        (extraMonthlyMinutesByEmployee?.get(employee.id) ?? 0) +
        list.reduce((sum, a) => sum + (a.context ? 0 : a.workMinutes), 0);
      const ratio = minutes / target;
      // Überstunden wiegen doppelt so schwer wie Minusstunden
      const deviation = ratio < 1 ? 1 - ratio : (ratio - 1) * 2;
      score += deviation * deviation * 1000;
    }
    const workDays = new Set(list.map((a) => a.date));
    for (const date of workDays) {
      const twoLater = addIsoDays(date, 2);
      const between = addIsoDays(date, 1);
      if (twoLater && between && workDays.has(twoLater) && !workDays.has(between)) score += 15;
    }
    for (const assignment of list) {
      if (assignment.slotIndex === null) continue;
      const status = availabilityMap.get(`${employee.id}-${assignment.date}`)?.status ?? null;
      if (calculatePreferencePenalty(status?.toLowerCase() ?? null, assignment.start) > 0) score += 12;
    }
  }

  return { plannedShifts, unfilledSlots, score: Math.round(score * 10) / 10, rejected };
}
