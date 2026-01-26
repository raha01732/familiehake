// src/app/tools/dienstplaner/utils.ts
export type PauseRule = {
  min_minutes: number;
  pause_minutes: number;
};

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
