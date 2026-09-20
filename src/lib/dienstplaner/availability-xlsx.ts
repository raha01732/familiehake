// src/lib/dienstplaner/availability-xlsx.ts
// Liest eine hochgeladene Excel-Datei mit Verfügbarkeiten ein.
// Erwartetes Layout: erste (gefüllte) Spalte = Mitarbeitername, eine Kopfzeile
// mit Datums-/Tagesangaben, darunter je Zeile die Status-Zellen pro Tag.
// Server-only (verwendet exceljs).
import ExcelJS from "exceljs";
import { matchEmployeeName, type NameMatchInput } from "./name-match";
import { mapAvailabilityCell, parseHeaderDate, pad2 } from "./availability-parse";
import type {
  ParsedAvailabilityEntry,
  ParsedAvailabilityResult,
  ParsedAvailabilityRow,
} from "./import-types";

const NAME_HEADER_RE = /name|mitarbeiter|kolleg|person|mitarb/i;
const SECTION_ROW_RE = /^(summe|gesamt|soll|ist|besetzung|bedarf|kw\s|woche|monat|total)/i;
const MAX_ROWS = 400;
const MAX_COLS = 200;

type CellVal = { text: string; value: unknown };

function formatDateValue(v: Date): string {
  if (v.getUTCFullYear() <= 1901) {
    return `${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}`;
  }
  return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
}

/**
 * Manche Dienstpläne kodieren Uhrzeiten als reine Zahl (z.B. 930 für 9:30)
 * mit einem Custom-Zahlenformat wie `00":"00`, das die Ziffern beim Anzeigen
 * in Gruppen aufteilt (hier zwei 2er-Gruppen, getrennt durch einen
 * literalen Doppelpunkt). exceljs liefert dafür den rohen Zahlenwert ohne
 * Formatierung — dieser Helfer rekonstruiert die Anzeige (z.B. "09:30").
 * Gibt null zurück, wenn das Zahlenformat nicht zu diesem Muster passt.
 */
function formatDigitGroupsFromNumFmt(value: number, numFmt: string | undefined | null): string | null {
  if (!numFmt || !numFmt.includes(":") || !Number.isFinite(value) || value < 0) return null;
  const groups = numFmt.match(/0+/g);
  if (!groups || groups.length < 2) return null;
  const widths = groups.map((g) => g.length);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const digits = String(Math.trunc(value)).padStart(totalWidth, "0");
  if (digits.length !== totalWidth) return null; // Zahl passt nicht ins Format
  const parts: string[] = [];
  let offset = 0;
  for (const w of widths) {
    parts.push(digits.slice(offset, offset + w));
    offset += w;
  }
  return parts.join(":");
}

export function cellToText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return formatDigitGroupsFromNumFmt(v, cell.numFmt) ?? String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return formatDateValue(v);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim();
    }
    if (obj.result instanceof Date) return formatDateValue(obj.result);
    if (typeof obj.result === "number") {
      return formatDigitGroupsFromNumFmt(obj.result, cell.numFmt) ?? String(obj.result).trim();
    }
    if (typeof obj.result === "string") return obj.result.trim();
    if (typeof obj.text === "string") return obj.text.trim();
    if ("formula" in obj) return "";
  }
  return String(v).trim();
}

type SheetResult = {
  sheetName: string;
  rows: ParsedAvailabilityRow[];
  headerDates: (string | null)[];
  notes: string[];
};

/**
 * Versucht, aus EINEM Arbeitsblatt eine Verfügbarkeits-Tabelle zu lesen. Gibt
 * null zurück, wenn das Blatt keine erkennbare Datums-Kopfzeile hat (z.B.
 * ein Deckblatt) — dann probiert der Aufrufer das nächste Blatt.
 */
function parseWorksheet(
  ws: ExcelJS.Worksheet,
  employees: NameMatchInput[],
  fallbackMonth: string | null
): SheetResult | null {
  const rawRows: { rowNumber: number; cells: CellVal[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rawRows.length >= MAX_ROWS) return;
    const cells: CellVal[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > MAX_COLS) return;
      cells[col - 1] = { text: cellToText(cell), value: cell.value };
    });
    rawRows.push({ rowNumber, cells });
  });
  if (rawRows.length === 0) return null;

  // Kopfzeile = Zeile mit den meisten datumsartigen Zellen (unter den ersten 8).
  let headerRowIdx = -1;
  let headerDates: (string | null)[] = [];
  let bestCount = 0;
  for (let i = 0; i < Math.min(rawRows.length, 8); i += 1) {
    const dates = rawRows[i].cells.map((c) =>
      c ? parseHeaderDate(c.value ?? c.text, fallbackMonth) : null
    );
    const count = dates.filter(Boolean).length;
    if (count > bestCount) {
      bestCount = count;
      headerRowIdx = i;
      headerDates = dates;
    }
  }
  if (headerRowIdx === -1 || bestCount < 3) return null;

  const firstDateCol = headerDates.findIndex(Boolean);
  let nameCol = 0;
  for (let c = 0; c < firstDateCol; c += 1) {
    const text = rawRows[headerRowIdx].cells[c]?.text ?? "";
    if (NAME_HEADER_RE.test(text)) {
      nameCol = c;
      break;
    }
    if (text) nameCol = c;
  }

  const rows: ParsedAvailabilityRow[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i += 1) {
    const { rowNumber, cells } = rawRows[i];
    const rawName = (cells[nameCol]?.text ?? "").trim();
    if (!rawName || SECTION_ROW_RE.test(rawName)) continue;

    const entries: ParsedAvailabilityEntry[] = [];
    for (let c = 0; c < headerDates.length; c += 1) {
      const date = headerDates[c];
      if (!date) continue;
      const rawValue = (cells[c]?.text ?? "").trim();
      if (!rawValue) continue;
      const mapped = mapAvailabilityCell(rawValue);
      entries.push({
        date,
        rawValue,
        status: mapped.status,
        fixedStart: mapped.fixedStart,
        fixedEnd: mapped.fixedEnd,
        mapped: mapped.mapped,
      });
    }
    if (entries.length === 0) continue;

    const match = matchEmployeeName(rawName, employees);
    rows.push({ rowIndex: rowNumber, rawName, ...match, entries });
  }

  const notes: string[] = [];
  if (rows.length === 0) {
    notes.push("Kopfzeile erkannt, aber keine Mitarbeiterzeilen mit Werten gefunden.");
  }

  return { sheetName: ws.name, rows, headerDates, notes };
}

export async function parseAvailabilityWorkbook(
  data: ArrayBuffer | Buffer,
  employees: NameMatchInput[],
  opts: { fallbackMonth?: string | null } = {}
): Promise<ParsedAvailabilityResult> {
  const fallbackMonth =
    opts.fallbackMonth && /^\d{4}-\d{2}$/.test(opts.fallbackMonth) ? opts.fallbackMonth : null;

  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  if (wb.worksheets.length === 0) {
    return { periodStart: null, periodEnd: null, rows: [], notes: ["Keine Tabelle in der Datei gefunden."] };
  }

  // Mehrere Arbeitsblätter möglich (z.B. Deckblatt vor der eigentlichen
  // Verfügbarkeitsliste) — jedes Blatt wird versucht, das mit den meisten
  // erkannten Mitarbeiterzeilen gewinnt.
  let best: SheetResult | null = null;
  for (const ws of wb.worksheets) {
    const parsed = parseWorksheet(ws, employees, fallbackMonth);
    if (!parsed) continue;
    if (!best || parsed.rows.length > best.rows.length) best = parsed;
  }

  if (!best) {
    const sheetHint =
      wb.worksheets.length > 1
        ? ` (geprüfte Arbeitsblätter: ${wb.worksheets.map((s) => s.name).join(", ")})`
        : "";
    return {
      periodStart: null,
      periodEnd: null,
      rows: [],
      notes: [
        "Konnte keine Datums-Kopfzeile erkennen. Erwartet wird eine Zeile mit Datums- oder Tagesangaben " +
          `(eine Spalte je Tag). Bei reinen Tageszahlen bitte den Monat oben auswählen${sheetHint}.`,
      ],
    };
  }

  const { rows, headerDates, notes } = best;
  if (wb.worksheets.length > 1) {
    notes.push(`Arbeitsblatt "${best.sheetName}" verwendet (von ${wb.worksheets.length} Blättern in der Datei).`);
  }

  const sortedDates = headerDates.filter((d): d is string => Boolean(d)).sort();
  const periodStart = sortedDates[0] ?? null;
  const periodEnd = sortedDates[sortedDates.length - 1] ?? null;

  const unmatched = rows.filter((r) => !r.matchedEmployeeId).length;
  if (unmatched > 0) {
    notes.push(`${unmatched} Name(n) ohne sichere Zuordnung — bitte im Review prüfen.`);
  }
  const unmapped = rows.reduce((sum, r) => sum + r.entries.filter((e) => !e.mapped).length, 0);
  if (unmapped > 0) {
    notes.push(`${unmapped} Zelle(n) mit unklarem Wert — bitte im Review prüfen.`);
  }
  if (fallbackMonth && periodStart && !periodStart.startsWith(fallbackMonth)) {
    notes.push(
      `Der erkannte Zeitraum beginnt am ${periodStart}, weicht also vom gewählten Monat ${fallbackMonth} ab.`
    );
  }

  return { periodStart, periodEnd, rows, notes };
}
