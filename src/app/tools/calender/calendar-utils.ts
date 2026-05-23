// src/app/tools/calender/calendar-utils.ts
// Gemeinsame Typen und Datums-/Event-Hilfen für die Kalender-Ansichten.
// Alle Berechnungen laufen in lokaler Zeit (Browser-Zeitzone).

export type CalendarView = "month" | "week" | "agenda";

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  location?: string | null;
  description?: string | null;
  allDay?: boolean;
  /** true bei externen (abonnierten) Terminen – nicht editierbar. */
  readOnly?: boolean;
  /** HSL-Hue (String) für externe Feeds; eigene Termine nutzen Primary. */
  color?: string;
  feedId?: string;
  feedName?: string;
};

export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Datums-Grundlagen ─────────────────────────────────────────────

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const weekday = (x.getDay() + 6) % 7; // Mo=0 … So=6
  x.setDate(x.getDate() - weekday);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/** 6×7-Raster (immer 42 Tage), beginnend am Montag der ersten Woche. */
export function getMonthGrid(month: Date): Date[] {
  const gridStart = startOfWeekMonday(startOfMonth(month));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** Die 7 Tage (Mo–So) der Woche, in der `d` liegt. */
export function getWeekDays(d: Date): Date[] {
  const start = startOfWeekMonday(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ─── Formatierung (de-DE) ──────────────────────────────────────────

const fmtMonthTitle = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const fmtTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDayLong = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtDayMonth = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const fmtWeekdayShort = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

export function formatMonthTitle(d: Date): string {
  return fmtMonthTitle.format(d);
}
export function formatTime(d: Date): string {
  return fmtTime.format(d);
}
export function formatDayLong(d: Date): string {
  return fmtDayLong.format(d);
}
export function formatDayMonth(d: Date): string {
  return fmtDayMonth.format(d);
}
export function formatWeekdayShort(d: Date): string {
  return fmtWeekdayShort.format(d);
}

/** Titel für die Wochenansicht, z. B. „19.–25. Mai 2026". */
export function formatWeekTitle(weekDays: Date[]): string {
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  if (isSameMonth(first, last)) {
    return `${first.getDate()}.–${last.getDate()}. ${fmtMonthTitle.format(first)}`;
  }
  return `${fmtDayMonth.format(first)} – ${fmtDayMonth.format(last)} ${last.getFullYear()}`;
}

/** Wert für <input type="datetime-local"> in lokaler Zeit. */
export function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// ─── Event-Helfer ──────────────────────────────────────────────────

export function eventStart(e: CalendarEvent): Date {
  return new Date(e.starts_at);
}
export function eventEnd(e: CalendarEvent): Date {
  return new Date(e.ends_at);
}

export function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
  return eventStart(a).getTime() - eventStart(b).getTime();
}

/** Alle Events, die den Tag berühren (inkl. mehrtägiger), sortiert. */
export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  return events
    .filter((e) => {
      const s = eventStart(e).getTime();
      const en = eventEnd(e).getTime();
      return s < dayEnd && en > dayStart;
    })
    .sort(sortEvents);
}

/** Zeitfenster, das für eine Ansicht an externen Events geladen wird. */
export function getViewRange(view: CalendarView, cursor: Date): { from: Date; to: Date } {
  if (view === "week") {
    const start = startOfWeekMonday(cursor);
    return { from: start, to: addDays(start, 7) };
  }
  if (view === "agenda") {
    const start = startOfDay(new Date());
    return { from: start, to: addDays(start, 120) };
  }
  // month – etwas Puffer um das Raster
  const grid = getMonthGrid(cursor);
  return { from: addDays(grid[0], -1), to: addDays(grid[41], 2) };
}

/** Akzentfarben eines Events (eigene → Primary, extern → Feed-Hue). */
export function eventAccent(e: CalendarEvent): { solid: string; soft: string } {
  if (e.color) {
    return { solid: `hsl(${e.color} 70% 50%)`, soft: `hsl(${e.color} 70% 50% / 0.16)` };
  }
  return { solid: "hsl(var(--primary))", soft: "hsl(var(--primary) / 0.14)" };
}

// ─── Wochenansicht: Zeit-Layout mit Überlappungs-Spalten ───────────

export type PositionedEvent = {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
};

/**
 * Positioniert die zeitgebundenen Events eines Tages: berechnet Start-/
 * End-Minute (auf den Tag begrenzt) sowie Spur/Spurenzahl für nebeneinander
 * liegende, sich überlappende Termine.
 */
export function layoutDayEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const dayStart = startOfDay(day).getTime();

  const items = events
    .map((event) => {
      const s = eventStart(event).getTime();
      const e = eventEnd(event).getTime();
      const startMin = Math.max(0, Math.round((s - dayStart) / 60000));
      let endMin = Math.min(1440, Math.round((e - dayStart) / 60000));
      if (endMin <= startMin) endMin = Math.min(1440, startMin + 30);
      return { event, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const result: PositionedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placed = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else {
        laneEnds[lane] = it.endMin;
      }
      return { ...it, lane };
    });
    const lanes = laneEnds.length;
    placed.forEach((p) => result.push({ ...p, lanes }));
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();

  return result;
}
