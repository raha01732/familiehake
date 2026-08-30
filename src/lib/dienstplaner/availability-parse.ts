// src/lib/dienstplaner/availability-parse.ts
// Reine Parser-Helfer für den Excel-Verfügbarkeitsimport. Keine Server-/
// exceljs-Abhängigkeit, damit unter dem Test-Runner lauffähig.
import { normalizeName } from "./name-match";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Bekannte Verfügbarkeits-Kürzel (Schlüssel bereits über normalizeName normiert). */
const STATUS_KEYWORDS: Record<string, string> = {
  u: "U",
  ub: "U",
  url: "U",
  urlaub: "U",
  k: "K",
  krank: "K",
  krankheit: "K",
  au: "K",
  f: "F",
  frei: "F",
  x: "F",
  nein: "F",
  no: "F",
  fr: "fr",
  fruh: "fr",
  fruhdienst: "fr",
  fruhschicht: "fr",
  frueh: "fr",
  sp: "sp",
  spat: "sp",
  spatdienst: "sp",
  spatschicht: "sp",
  spaet: "sp",
};

export type MappedCell = {
  status: string | null; // F | U | K | fr | sp | fix — null = verfügbar/leer
  fixedStart: string | null;
  fixedEnd: string | null;
  mapped: boolean; // false => unklar, im Review prüfen
};

/** "9-14", "09:00 - 14:00", "9.00–14.00 Uhr" → feste Zeiten. */
export function parseTimeRange(value: string): { start: string; end: string } | null {
  const m = value
    .trim()
    .match(
      /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|bis)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?$/i
    );
  if (!m) return null;
  const h1 = Number(m[1]);
  const min1 = m[2] ? Number(m[2]) : 0;
  const h2 = Number(m[3]);
  const min2 = m[4] ? Number(m[4]) : 0;
  if (h1 > 23 || h2 > 23 || min1 > 59 || min2 > 59) return null;
  return { start: `${pad2(h1)}:${pad2(min1)}`, end: `${pad2(h2)}:${pad2(min2)}` };
}

/**
 * Ordnet einen rohen Zellwert einem Verfügbarkeits-Status zu.
 * Leere Zelle → status null, mapped true (nichts zu importieren).
 * Unbekannter Text → status null, mapped false (Review nötig).
 */
export function mapAvailabilityCell(raw: string): MappedCell {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { status: null, fixedStart: null, fixedEnd: null, mapped: true };

  const range = parseTimeRange(trimmed);
  if (range) {
    return { status: "fix", fixedStart: range.start, fixedEnd: range.end, mapped: true };
  }

  const norm = normalizeName(trimmed);
  const compact = norm.replace(/\s+/g, "");
  const hit = STATUS_KEYWORDS[norm] ?? STATUS_KEYWORDS[compact];
  if (hit) return { status: hit, fixedStart: null, fixedEnd: null, mapped: true };

  return { status: null, fixedStart: null, fixedEnd: null, mapped: false };
}

/**
 * Interpretiert eine Kopfzellen-Angabe als Datum (YYYY-MM-DD).
 * Akzeptiert Date-Objekte, Excel-Seriennummern, ISO, DD.MM.(YYYY) und reine
 * Tageszahlen (dann wird fallbackMonth = "YYYY-MM" benötigt).
 */
export function parseHeaderDate(value: unknown, fallbackMonth: string | null): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 31 && fallbackMonth) {
      return `${fallbackMonth}-${pad2(value)}`;
    }
    // Excel-Seriennummer (Tage seit 1899-12-30)
    if (value > 59 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const dt = new Date(ms);
      const y = dt.getUTCFullYear();
      if (y < 2000 || y > 2100) return null;
      return `${y}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
    }
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy: number;
    if (m[3]) {
      yy = Number(m[3]);
      if (m[3].length === 2) yy += 2000;
    } else if (fallbackMonth) {
      yy = Number(fallbackMonth.slice(0, 4));
    } else {
      return null;
    }
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }

  // "Mo 5", "Fr, 14." oder nur "14" → Tageszahl + fallbackMonth
  m = s.match(/(\d{1,2})\.?\s*$/);
  if (m && fallbackMonth) {
    const dd = Number(m[1]);
    if (dd >= 1 && dd <= 31) return `${fallbackMonth}-${pad2(dd)}`;
  }

  return null;
}
