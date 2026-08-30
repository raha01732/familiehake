// src/lib/dienstplaner/history-insights.ts
// Leitet aus bestätigten historischen Schichten (dienstplan_history_shifts)
// aggregierte Muster ab: typische Besetzung pro Wochentag/Position, häufige
// Schichtzeiten, Positions-Affinität je Mitarbeiter. Reine Funktionen.

export type HistoryShift = {
  shift_date: string; // YYYY-MM-DD
  employee_name: string;
  employee_id: number | null;
  position: string | null;
  start_time: string | null; // HH:MM(:SS)
  end_time: string | null;
  source_note?: string | null;
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const NO_POSITION = "—";

export type WeekdayPositionStat = {
  weekday: number; // 0=So..6=Sa
  weekdayLabel: string;
  position: string;
  daysObserved: number;
  avgHeadcount: number; // Ø Personen an Tagen, an denen die Position vorkam
  typicalStart: string | null;
  typicalEnd: string | null;
};

export type WeekdayHeadcountStat = {
  weekday: number;
  weekdayLabel: string;
  daysObserved: number;
  avgHeadcount: number;
  minHeadcount: number;
  maxHeadcount: number;
};

export type ShiftTimeStat = { start: string; end: string; count: number };

export type EmployeePositionAffinity = {
  employeeName: string;
  employeeId: number | null;
  position: string;
  count: number;
};

export type NoteSample = { note: string; count: number };

export type HistoryInsights = {
  totalShifts: number;
  distinctDays: number;
  dateRange: { start: string; end: string } | null;
  weekdayHeadcount: WeekdayHeadcountStat[];
  weekdayPosition: WeekdayPositionStat[];
  commonTimes: ShiftTimeStat[];
  employeeAffinity: EmployeePositionAffinity[];
  /** Häufigste Schicht-Notizen (Kontext / Verfügbarkeitshinweise). */
  commonNotes: NoteSample[];
  notedShifts: number;
};

function hm(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function weekdayOf(dateIso: string): number | null {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeHistoryInsights(shifts: HistoryShift[]): HistoryInsights {
  const clean = shifts.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.shift_date));
  const dates = clean.map((s) => s.shift_date).sort();
  const distinctDays = new Set(dates).size;

  // ── Pro Tag: Gesamt-Headcount + (Position → Anzahl) ──────────────────────
  const perDayTotal = new Map<string, number>();
  const perDayPosition = new Map<string, Map<string, number>>();
  for (const s of clean) {
    perDayTotal.set(s.shift_date, (perDayTotal.get(s.shift_date) ?? 0) + 1);
    const pos = (s.position ?? "").trim() || NO_POSITION;
    const dayMap = perDayPosition.get(s.shift_date) ?? new Map<string, number>();
    dayMap.set(pos, (dayMap.get(pos) ?? 0) + 1);
    perDayPosition.set(s.shift_date, dayMap);
  }

  // ── Wochentag → Liste der Tages-Headcounts ───────────────────────────────
  const weekdayTotals = new Map<number, number[]>();
  for (const [date, total] of perDayTotal) {
    const wd = weekdayOf(date);
    if (wd === null) continue;
    const list = weekdayTotals.get(wd) ?? [];
    list.push(total);
    weekdayTotals.set(wd, list);
  }
  const weekdayHeadcount: WeekdayHeadcountStat[] = [];
  for (let wd = 0; wd < 7; wd += 1) {
    const list = weekdayTotals.get(wd);
    if (!list || list.length === 0) continue;
    weekdayHeadcount.push({
      weekday: wd,
      weekdayLabel: WEEKDAY_LABELS[wd],
      daysObserved: list.length,
      avgHeadcount: round1(list.reduce((a, b) => a + b, 0) / list.length),
      minHeadcount: Math.min(...list),
      maxHeadcount: Math.max(...list),
    });
  }

  // ── Wochentag × Position → Ø Headcount + typische Zeiten ─────────────────
  const wpCounts = new Map<string, number[]>(); // key `${wd}|${pos}` → per-day counts
  for (const [date, dayMap] of perDayPosition) {
    const wd = weekdayOf(date);
    if (wd === null) continue;
    for (const [pos, count] of dayMap) {
      const key = `${wd}|${pos}`;
      const list = wpCounts.get(key) ?? [];
      list.push(count);
      wpCounts.set(key, list);
    }
  }
  const wpTimes = new Map<string, { starts: string[]; ends: string[] }>();
  for (const s of clean) {
    const wd = weekdayOf(s.shift_date);
    if (wd === null) continue;
    const pos = (s.position ?? "").trim() || NO_POSITION;
    const key = `${wd}|${pos}`;
    const bucket = wpTimes.get(key) ?? { starts: [], ends: [] };
    const st = hm(s.start_time);
    const en = hm(s.end_time);
    if (st) bucket.starts.push(st);
    if (en) bucket.ends.push(en);
    wpTimes.set(key, bucket);
  }
  const weekdayPosition: WeekdayPositionStat[] = [];
  for (const [key, list] of wpCounts) {
    const [wdStr, pos] = key.split("|");
    const wd = Number(wdStr);
    const times = wpTimes.get(key) ?? { starts: [], ends: [] };
    weekdayPosition.push({
      weekday: wd,
      weekdayLabel: WEEKDAY_LABELS[wd] ?? String(wd),
      position: pos,
      daysObserved: list.length,
      avgHeadcount: round1(list.reduce((a, b) => a + b, 0) / list.length),
      typicalStart: mode(times.starts),
      typicalEnd: mode(times.ends),
    });
  }
  weekdayPosition.sort(
    (a, b) => a.weekday - b.weekday || b.avgHeadcount - a.avgHeadcount || a.position.localeCompare(b.position, "de")
  );

  // ── Häufigste Schichtzeiten ─────────────────────────────────────────────
  const timeCounts = new Map<string, number>();
  for (const s of clean) {
    const st = hm(s.start_time);
    const en = hm(s.end_time);
    if (!st || !en) continue;
    const key = `${st}-${en}`;
    timeCounts.set(key, (timeCounts.get(key) ?? 0) + 1);
  }
  const commonTimes: ShiftTimeStat[] = [...timeCounts.entries()]
    .map(([key, count]) => {
      const [start, end] = key.split("-");
      return { start, end, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Positions-Affinität je Mitarbeiter ─────────────────────────────────
  const affCounts = new Map<string, EmployeePositionAffinity>();
  for (const s of clean) {
    const pos = (s.position ?? "").trim();
    if (!pos) continue;
    const name = s.employee_name.trim();
    if (!name) continue;
    const key = `${s.employee_id ?? name}|${pos.toLowerCase()}`;
    const existing = affCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      affCounts.set(key, {
        employeeName: name,
        employeeId: s.employee_id,
        position: pos,
        count: 1,
      });
    }
  }
  const employeeAffinity = [...affCounts.values()]
    .sort((a, b) => b.count - a.count || a.employeeName.localeCompare(b.employeeName, "de"))
    .slice(0, 30);

  // ── Häufigste Schicht-Notizen ─────────────────────────────────────────
  const noteCounts = new Map<string, number>();
  let notedShifts = 0;
  for (const s of clean) {
    const note = (s.source_note ?? "").trim();
    if (!note) continue;
    notedShifts += 1;
    const key = note.length > 80 ? note.slice(0, 80) : note;
    noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1);
  }
  const commonNotes: NoteSample[] = [...noteCounts.entries()]
    .map(([note, count]) => ({ note, count }))
    .sort((a, b) => b.count - a.count || a.note.localeCompare(b.note, "de"))
    .slice(0, 20);

  return {
    totalShifts: clean.length,
    distinctDays,
    dateRange: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null,
    weekdayHeadcount,
    weekdayPosition,
    commonTimes,
    employeeAffinity,
    commonNotes,
    notedShifts,
  };
}

/**
 * Kompakter Textblock für den KI-Planungs-Prompt. Bewusst knapp gehalten,
 * damit das Token-Budget für den JSON-Output reicht. Leerer String, wenn zu
 * wenig Historie vorhanden ist.
 */
export function buildHistoryPromptBlock(insights: HistoryInsights): string {
  if (insights.totalShifts < 12 || insights.distinctDays < 5) return "";

  const lines: string[] = [];
  lines.push(
    `HISTORISCHE_MUSTER (aus ${insights.totalShifts} früheren Schichten an ${insights.distinctDays} Tagen` +
      (insights.dateRange ? `, ${insights.dateRange.start}–${insights.dateRange.end}` : "") +
      "). Als Orientierung für realistische Besetzung nutzen, NICHT als harte Vorgabe:"
  );

  if (insights.weekdayHeadcount.length > 0) {
    const parts = insights.weekdayHeadcount.map(
      (w) => `${w.weekdayLabel}: ~${w.avgHeadcount} (${w.minHeadcount}-${w.maxHeadcount})`
    );
    lines.push(`- Ø Personen pro Wochentag: ${parts.join(", ")}`);
  }

  const topWp = insights.weekdayPosition
    .filter((w) => w.position !== NO_POSITION && w.daysObserved >= 2)
    .slice(0, 14);
  if (topWp.length > 0) {
    lines.push("- Typische Position je Wochentag (Ø Anzahl, übliche Zeit):");
    for (const w of topWp) {
      const time = w.typicalStart && w.typicalEnd ? ` ${w.typicalStart}-${w.typicalEnd}` : "";
      lines.push(`  · ${w.weekdayLabel} ${w.position}: ~${w.avgHeadcount}${time}`);
    }
  }

  if (insights.commonTimes.length > 0) {
    const parts = insights.commonTimes.slice(0, 6).map((t) => `${t.start}-${t.end} (${t.count}×)`);
    lines.push(`- Häufigste Schichtzeiten: ${parts.join(", ")}`);
  }

  if (insights.employeeAffinity.length > 0) {
    const parts = insights.employeeAffinity
      .slice(0, 12)
      .map((a) => `${a.employeeName}→${a.position} (${a.count}×)`);
    lines.push(`- Positions-Affinität: ${parts.join(", ")}`);
  }

  if (insights.commonNotes.length > 0) {
    const parts = insights.commonNotes
      .slice(0, 8)
      .map((n) => `"${n.note}"${n.count > 1 ? ` (${n.count}×)` : ""}`);
    lines.push(
      `- Wiederkehrende Schicht-Notizen (Kontext/Verfügbarkeit): ${parts.join(", ")}`
    );
  }

  return lines.join("\n");
}
