// Schichtregeln (Wochentage) und Tages-Anpassungen → konkrete offene Slots.
// Reine Funktionen ohne Datenbankzugriff, damit sie getestet und im Client genutzt werden können.
import { inferPositionCategory } from "./utils";

export type ShiftRule = {
  id: number;
  position: string;
  /** Nur Projektionsleitung (Projektion-Regeln: Leitung zählt sonst gleichwertig mit). */
  require_leader: boolean;
  start_time: string;
  end_time: string;
  /** 0 = Sonntag … 6 = Samstag */
  weekdays: number[];
  required_count: number;
  note: string | null;
};

/** Abweichung für einen einzelnen Kalendertag; ersetzt an diesem Tag alle Wochenregeln. */
export type DayRequirement = {
  requirement_date: string;
  position: string;
  require_leader: boolean;
  start_time: string;
  end_time: string;
  /** 0 = Platzhalter „kein Bedarf an diesem Tag“ */
  required_count: number;
  note: string | null;
};

export type RequirementSlot = {
  position: string;
  require_leader: boolean;
  start_time: string;
  end_time: string;
  note: string | null;
  source: "rule" | "override";
};

/** Anzeigereihenfolge der Wochentage (Montag zuerst) */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

export type PositionKindValue = "serviceleitung" | "projektion" | "projektion_leitung" | "custom";

export const POSITION_KINDS: { value: Exclude<PositionKindValue, "custom">; label: string; position: string; leader: boolean }[] = [
  { value: "serviceleitung", label: "Serviceleitung", position: "Serviceleitung", leader: false },
  { value: "projektion", label: "Projektion (Projektionsleitung zählt mit)", position: "Projektion", leader: false },
  { value: "projektion_leitung", label: "Projektion – nur Projektionsleitung", position: "Projektion", leader: true },
];

export const CLOSED_DAY_POSITION = "Kein Bedarf";

export function resolvePositionKind(
  kind: string,
  custom: string
): { position: string; require_leader: boolean } | null {
  const known = POSITION_KINDS.find((entry) => entry.value === kind);
  if (known) return { position: known.position, require_leader: known.leader };
  const text = custom.trim();
  if (kind === "custom" && text) return { position: text, require_leader: false };
  return null;
}

/** Gegenstück zu resolvePositionKind – ordnet gespeicherte Daten einer Formularauswahl zu. */
export function kindOfPosition(position: string, requireLeader: boolean): { kind: PositionKindValue; custom: string } {
  const normalized = position.trim().toLowerCase();
  if (normalized === "serviceleitung") return { kind: "serviceleitung", custom: "" };
  if (normalized === "projektion") return { kind: requireLeader ? "projektion_leitung" : "projektion", custom: "" };
  if (normalized === "projektionsleitung") return { kind: "projektion_leitung", custom: "" };
  return { kind: "custom", custom: position };
}

export function describePosition(position: string, requireLeader: boolean): string {
  const { kind, custom } = kindOfPosition(position, requireLeader);
  if (kind === "custom") return custom;
  return POSITION_KINDS.find((entry) => entry.value === kind)?.label.replace(" (Projektionsleitung zählt mit)", "") ?? position;
}

/** true, wenn der Slot nur von einer Projektionsleitung besetzt werden darf. */
export function slotRequiresLeader(position: string | null, requireLeader: boolean | undefined): boolean {
  if (requireLeader) return true;
  return inferPositionCategory(position) === "projektionsleitung";
}

function hhmm(value: string) {
  return value.slice(0, 5);
}

function expand<T extends { required_count: number }>(item: T) {
  return Math.max(0, Math.floor(item.required_count));
}

/**
 * Welche Slots entstehen an einem Tag? Gibt es Tages-Anpassungen, ersetzen sie die
 * Wochenregeln vollständig (auch mit Anzahl 0 = „kein Bedarf“).
 */
export function slotsForDate(
  date: string,
  rules: ShiftRule[],
  overrides: DayRequirement[]
): { slots: RequirementSlot[]; overridden: boolean } {
  const dayOverrides = overrides.filter((item) => item.requirement_date === date);
  const slots: RequirementSlot[] = [];

  if (dayOverrides.length > 0) {
    for (const item of dayOverrides) {
      for (let i = 0; i < expand(item); i += 1) {
        slots.push({
          position: item.position,
          require_leader: item.require_leader,
          start_time: hhmm(item.start_time),
          end_time: hhmm(item.end_time),
          note: item.note,
          source: "override",
        });
      }
    }
  } else {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const rule of rules) {
      if (!rule.weekdays.includes(weekday)) continue;
      for (let i = 0; i < expand(rule); i += 1) {
        slots.push({
          position: rule.position,
          require_leader: rule.require_leader,
          start_time: hhmm(rule.start_time),
          end_time: hhmm(rule.end_time),
          note: rule.note,
          source: "rule",
        });
      }
    }
  }

  slots.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.position.localeCompare(b.position, "de"));
  return { slots, overridden: dayOverrides.length > 0 };
}

/**
 * Jede bereits eingetragene Schicht deckt höchstens einen Slot ab:
 * erst exakt (Beginn+Ende), dann nur nach Beginn.
 */
export function removeCoveredSlots<T extends { start_time: string; end_time: string }>(
  slots: T[],
  shifts: { start_time: string | null; end_time: string | null }[]
): T[] {
  const remaining = [...slots];
  const unmatched: { start: string; end: string }[] = [];
  for (const shift of shifts) {
    if (!shift.start_time || !shift.end_time) continue;
    const start = hhmm(shift.start_time);
    const end = hhmm(shift.end_time);
    const at = remaining.findIndex((slot) => hhmm(slot.start_time) === start && hhmm(slot.end_time) === end);
    if (at >= 0) remaining.splice(at, 1);
    else unmatched.push({ start, end });
  }
  for (const shift of unmatched) {
    const at = remaining.findIndex((slot) => hhmm(slot.start_time) === shift.start);
    if (at >= 0) remaining.splice(at, 1);
  }
  return remaining;
}
