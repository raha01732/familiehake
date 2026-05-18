// /workspace/familiehake/src/app/tools/auslassplanung/utils.ts

export type CleaningPreference = "preferred" | "backup";
export type ShowIntensity = "light" | "standard" | "intense";
export type ShowPlanStatus = "open" | "planned" | "locked" | "completed" | "cancelled";

export type CleaningHall = {
  id: number;
  hall_number: number;
  label: string | null;
  seat_count: number;
  notes: string | null;
};

export type CleaningStaff = {
  id: number;
  name: string;
  preference: CleaningPreference;
  color: string;
  is_active: boolean;
  user_id: string | null;
  notes: string | null;
  sort_order: number;
  /** HH:MM:SS oder null = keine Begrenzung */
  work_start: string | null;
  /** HH:MM:SS oder null = keine Begrenzung */
  work_end: string | null;
};

export type CleaningShow = {
  id: number;
  /** Lesbare öffentliche Kennung wie "a4t9023" — zusätzlich zur internen ID. */
  public_id: string | null;
  show_date: string;
  hall_number: number;
  hall_label: string | null;
  end_time: string;
  /** "Ende" aus FÜP — Zeitpunkt, an dem der Saal komplett leer ist. */
  room_clear_time: string | null;
  attendees: number;
  cleanup_minutes: number;
  intensity: ShowIntensity;
  movie_title: string | null;
  notes: string | null;
  plan_status: ShowPlanStatus;
  ai_recommended_staff_count: number | null;
  ai_notes: string | null;
};

export type CleaningAssignment = {
  id: number;
  show_id: number;
  staff_id: number;
  assigned_by: "manual" | "ai" | "override";
  reason: string | null;
  early_leave: boolean;
  released_at: string | null;
  early_leave_reason: string | null;
  created_at: string;
};

export type PlanRevision = {
  id: number;
  show_id: number;
  kind:
    | "add"
    | "remove"
    | "early_leave"
    | "late_join"
    | "count_change"
    | "reschedule";
  staff_id: number | null;
  reason: string | null;
  prev_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
};

export type CleaningFeedback = {
  show_id: number;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
  recorded_at: string;
};

export const INTENSITY_OPTIONS: { value: ShowIntensity; label: string; description: string }[] = [
  {
    value: "light",
    label: "Leicht",
    description: "z. B. Vormittagsvorstellung ohne Snacks — weniger Aufwand",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Normale Vorstellung — durchschnittlicher Aufwand",
  },
  {
    value: "intense",
    label: "Intensiv",
    description: "Familienfilm, 3D oder Erlebnis-Vorstellung — viel Müll",
  },
];

export const PREFERENCE_OPTIONS: { value: CleaningPreference; label: string; description: string }[] = [
  {
    value: "preferred",
    label: "Bevorzugt",
    description: "Wird primär eingeteilt",
  },
  {
    value: "backup",
    label: "Im Zweifelsfall",
    description: "Nur ergänzend / wenn bevorzugte MA nicht reichen",
  },
];

export const STAFF_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
  "#f43f5e",
];

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTimeRange(end: string, cleanupMinutes: number): string {
  const [hStr, mStr] = end.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return `${end} (+${cleanupMinutes}m)`;
  let totalMins = h * 60 + m + cleanupMinutes;
  totalMins = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const cleanH = Math.floor(totalMins / 60);
  const cleanM = totalMins % 60;
  const target = `${String(cleanH).padStart(2, "0")}:${String(cleanM).padStart(2, "0")}`;
  return `${end.slice(0, 5)} → fertig bis ${target}`;
}

/**
 * Heuristik-Fallback NUR wenn die KI nicht verfügbar ist. Die KI bekommt die
 * gleichen Inputs (attendees, seat_count, intensity, learning data) und sollte
 * den Großteil der Empfehlungen liefern — diese Funktion ist nur ein roher
 * Anker, kein scharfes Regelwerk.
 *
 * Idee: Auslastung (= attendees/seat_count) ist der primäre Faktor. Ein 80%
 * voller Saal mit 30 Plätzen ist anders zu bewerten als ein 80% voller Saal
 * mit 250 Plätzen — die KI entscheidet, die Heuristik liefert eine grobe
 * Hausnummer.
 */
export function recommendStaffCount(
  attendees: number,
  intensity: ShowIntensity,
  seatCount?: number | null,
): number {
  const factor = intensity === "intense" ? 1.3 : intensity === "light" ? 0.8 : 1;
  let base: number;
  if (seatCount && seatCount > 0) {
    // Auslastungs-basiert
    const occupancy = attendees / seatCount;
    if (occupancy <= 0.3) base = 1;
    else if (occupancy <= 0.6) base = 2;
    else base = 3;
    // Großer Saal mit hoher Auslastung erhöht die Untergrenze leicht
    if (seatCount >= 200 && occupancy > 0.5) base += 1;
  } else {
    // Fallback ohne Kapazität: ganz simple Stufen
    if (attendees <= 40) base = 1;
    else if (attendees <= 120) base = 2;
    else base = 3;
  }
  return Math.max(1, Math.round(base * factor));
}

/**
 * Kino-Tag-Sortierschlüssel für eine Vorstellung. Zeiten vor 06:00 gelten
 * als Spätabend/Folgetag-Morgen und werden ans Ende des Vortags einsortiert.
 * Rückgabe: Minuten seit Mitternacht des show_date, ggf. +24h für die
 * Frühstunden — sodass eine reine numerische Sortierung "Kino-chronologisch"
 * funktioniert.
 */
const CINEMA_DAY_CUTOFF_MIN = 6 * 60; // 06:00
function timeToMinutes(value: string): number {
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function cinemaDayMinutes(endTime: string): number {
  const mins = timeToMinutes(endTime);
  return mins < CINEMA_DAY_CUTOFF_MIN ? mins + 24 * 60 : mins;
}
export function compareShowsByCinemaDay(
  a: { show_date: string; end_time: string },
  b: { show_date: string; end_time: string },
): number {
  if (a.show_date !== b.show_date) return a.show_date.localeCompare(b.show_date);
  return cinemaDayMinutes(a.end_time) - cinemaDayMinutes(b.end_time);
}

/**
 * Liefert das aktuelle Datum aus Sicht des Kino-Tags (Europa/Berlin).
 * Vor 06:00 morgens gilt noch der Vortag — das matched die Sortier-Logik.
 */
export function currentCinemaDate(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hour12: false,
  });
  const dateStr = fmt.format(now); // "2026-05-17"
  const hour = Number(hourFmt.format(now));
  if (hour >= CINEMA_DAY_CUTOFF_MIN / 60) {
    return dateStr;
  }
  // Vor 06:00 → einen Tag zurück
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

/**
 * Erkennt "Rutschen" — Wellen von Auslässen, die als zusammengehöriger Block
 * geplant werden. Eine Rutsche endet, wenn:
 *   1. Ein Saal in der Rutsche wieder auftaucht (jeder Saal max. 1x pro Rutsche), ODER
 *   2. die zeitliche Lücke zum nächsten Auslass-Start > RUTSCHE_GAP_MIN Minuten ist.
 * Erwartet kino-chronologisch sortierte Shows (compareShowsByCinemaDay).
 */
export const RUTSCHE_GAP_MIN = 45;

export type Rutsche = {
  index: number; // 1-basiert für die Anzeige
  shows: CleaningShow[];
  startMin: number; // cinemaDayMinutes des frühesten Auslass-Starts
  endMin: number; // cinemaDayMinutes des spätesten Auslass-Starts
};

export function detectRutschen(shows: CleaningShow[]): Rutsche[] {
  if (shows.length === 0) return [];
  // Stabil kino-chronologisch sortieren (Datum aufsteigend, dann cinemaDayMinutes)
  const sorted = shows.slice().sort(compareShowsByCinemaDay);

  const rutschen: Rutsche[] = [];
  let current: CleaningShow[] = [];
  let halls = new Set<number>();
  let lastMin: number | null = null;
  let currentDate: string | null = null;

  function pushCurrent() {
    if (current.length === 0) return;
    const minutes = current.map((s) => cinemaDayMinutes(s.end_time));
    rutschen.push({
      index: rutschen.length + 1,
      shows: current,
      startMin: Math.min(...minutes),
      endMin: Math.max(...minutes),
    });
    current = [];
    halls = new Set();
    lastMin = null;
  }

  for (const show of sorted) {
    const cm = cinemaDayMinutes(show.end_time);
    const hallSeen = halls.has(show.hall_number);
    const sameDate = currentDate === null || currentDate === show.show_date;
    const gapTooBig = lastMin !== null && cm - lastMin > RUTSCHE_GAP_MIN;

    if (current.length > 0 && (hallSeen || gapTooBig || !sameDate)) {
      pushCurrent();
    }
    if (current.length === 0) currentDate = show.show_date;
    current.push(show);
    halls.add(show.hall_number);
    lastMin = cm;
  }
  pushCurrent();
  return rutschen;
}

/** Formatiert die Zeitspanne einer Rutsche in HH:MM für die Anzeige. */
export function formatRutscheRange(r: Rutsche): string {
  function fmt(min: number): string {
    const m = min % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  if (r.startMin === r.endMin) return fmt(r.startMin);
  return `${fmt(r.startMin)} – ${fmt(r.endMin)}`;
}

/**
 * Prüft, ob das gesamte Reinigungsfenster innerhalb der Arbeitszeit
 * des MAs liegt. Wenn work_start/work_end null sind, ist der MA
 * jederzeit verfügbar. work_end vor work_start bedeutet eine Schicht,
 * die über Mitternacht geht.
 */
export function isCleanupWithinShift(
  cleanupStartTime: string,
  cleanupMinutes: number,
  workStart: string | null,
  workEnd: string | null,
): boolean {
  if (!workStart || !workEnd) return true;
  const startM = timeToMinutes(cleanupStartTime);
  const endM = startM + Math.max(0, cleanupMinutes);
  const wStart = timeToMinutes(workStart);
  let wEnd = timeToMinutes(workEnd);

  // Wenn Schicht über Mitternacht geht: wEnd > wStart auf 48h-Skala
  const crossesMidnight = wEnd <= wStart;
  if (crossesMidnight) wEnd += 24 * 60;

  // Cleanup-Fenster auf passende Achse legen: wenn cleanup vor wStart
  // beginnt und Schicht über Mitternacht geht, ist es ein Folgetags-Slot
  let cStart = startM;
  let cEnd = endM;
  if (crossesMidnight && cStart < wStart) {
    cStart += 24 * 60;
    cEnd += 24 * 60;
  }

  return cStart >= wStart && cEnd <= wEnd;
}
