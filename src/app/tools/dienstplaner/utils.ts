// src/app/tools/dienstplaner/utils.ts
export type PauseRule = {
  min_minutes: number;
  pause_minutes: number;
};

type ParsedShift = {
  rawInput: string;
  startTime: string | null;
  endTime: string | null;
};

const TIME_RANGE_REGEX = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

function normalizeTime(hours: number, minutes: number) {
  const safeHours = Math.min(Math.max(hours, 0), 23);
  const safeMinutes = Math.min(Math.max(minutes, 0), 59);
  return `${String(safeHours).padStart(2, "0")}:${String(safeMinutes).padStart(2, "0")}`;
}

function parseTimeValue(value: string) {
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function parseShiftInput(value: string): ParsedShift | null {
  const rawInput = value.trim();
  if (!rawInput) return null;

  const match = rawInput.match(TIME_RANGE_REGEX);
  if (!match) {
    return { rawInput, startTime: null, endTime: null };
  }

  const startHours = Number(match[1]);
  const startMinutes = Number(match[2]);
  const endHours = Number(match[3]);
  const endMinutes = Number(match[4]);

  if ([startHours, startMinutes, endHours, endMinutes].some((val) => Number.isNaN(val))) {
    return { rawInput, startTime: null, endTime: null };
  }

  const startTime = normalizeTime(startHours, startMinutes);
  const endTime = normalizeTime(endHours, endMinutes);

  return { rawInput, startTime, endTime };
}

export function formatShiftValue(startTime: string | null, endTime: string | null, rawInput?: string | null) {
  if (rawInput?.trim()) return rawInput;
  if (!startTime || !endTime) return "";

  const normalizedStart = startTime.slice(0, 5);
  const normalizedEnd = endTime.slice(0, 5);
  return `${normalizedStart}-${normalizedEnd}`;
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
