// src/lib/ics.ts
// ICS-Hilfen: eigene Termine als VCALENDAR exportieren (toICS) sowie
// externe Feeds parsen (parseIcsEvents) inkl. RRULE-Serien-Expansion.
import ICAL from "ical.js";
import { APP_NAME, APP_NAME_SLUG } from "@/lib/app-name";

// ─── Export (eigene Termine) ───────────────────────────────────────

// Minimaler ICS-Generator
export function toICS(events: Array<{
  uid: string; title: string; startsAt: string; endsAt: string; location?: string; description?: string;
}>) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME_SLUG}//Calendar//DE`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${APP_NAME}`,
  ];
  const stamp = dt(new Date());
  for (const e of events) {
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}@familyhake`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${dt(start)}`);
    lines.push(`DTEND:${dt(end)}`);
    if (e.title) lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function dt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

/** Faltet Zeilen gemäß RFC 5545 (max. 75 Oktett, Fortsetzung mit Leerzeichen). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

// ─── Import (externe Feeds parsen) ──────────────────────────────────

export type ParsedEvent = {
  uid: string;
  title: string;
  starts_at: string; // ISO (UTC)
  ends_at: string; // ISO (UTC)
  location: string | null;
  description: string | null;
  allDay: boolean;
};

// Schutz gegen entartete Feeds (sehr alte DTSTART + häufige Serie).
const MAX_TOTAL_ITERATIONS = 20_000;
const MAX_OCCURRENCES_PER_EVENT = 2_000;

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

/**
 * Parst einen ICS-Feed und liefert alle Termine, die das Fenster
 * [windowStart, windowEnd] berühren. Serien (RRULE) werden expandiert.
 */
export function parseIcsEvents(ics: string, windowStart: Date, windowEnd: Date): ParsedEvent[] {
  const out: ParsedEvent[] = [];

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    return out;
  }

  for (const ve of root.getAllSubcomponents("vevent")) {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(ve);
    } catch {
      continue;
    }

    // Reine Ausnahme-Komponenten (RECURRENCE-ID) überspringen – ical.js
    // berücksichtigt sie über die Mutter-Serie.
    if (event.isRecurrenceException()) continue;

    const title = asString(ve.getFirstPropertyValue("summary")) || "(ohne Titel)";
    const location = asString(ve.getFirstPropertyValue("location"));
    const description = asString(ve.getFirstPropertyValue("description"));
    const uid = event.uid || asString(ve.getFirstPropertyValue("uid")) || cryptoRandom();

    const push = (startT: ICAL.Time, endT: ICAL.Time | null) => {
      const allDay = Boolean(startT.isDate);
      const start = startT.toJSDate();
      const end = endT ? endT.toJSDate() : new Date(start.getTime() + 60 * 60 * 1000);
      out.push({
        uid,
        title,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location,
        description,
        allDay,
      });
    };

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next: ICAL.Time | null;
      let collected = 0;
      let iterations = 0;
      while ((next = iterator.next())) {
        if (++iterations > MAX_TOTAL_ITERATIONS) break;
        if (collected >= MAX_OCCURRENCES_PER_EVENT) break;
        if (next.toJSDate() > windowEnd) break;

        const details = event.getOccurrenceDetails(next);
        if (details.endDate.toJSDate() >= windowStart) {
          push(details.startDate, details.endDate);
          collected++;
        }
      }
    } else {
      const start = event.startDate ? event.startDate.toJSDate() : null;
      if (!start) continue;
      const end = event.endDate ? event.endDate.toJSDate() : new Date(start.getTime() + 60 * 60 * 1000);
      if (end >= windowStart && start <= windowEnd) {
        push(event.startDate, event.endDate ?? event.startDate);
      }
    }
  }

  return out;
}

function cryptoRandom(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `uid-${Math.random().toString(36).slice(2)}`;
  }
}
