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
const MAX_COLS = 80;

type CellVal = { text: string; value: unknown };

function cellToText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) {
    if (v.getUTCFullYear() <= 1901) {
      return `${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}`;
    }
    return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim();
    }
    if (typeof obj.result === "string" || typeof obj.result === "number") {
      return String(obj.result).trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if ("formula" in obj) return "";
  }
  return String(v).trim();
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

  const notes: string[] = [];
  const ws =
    wb.worksheets.find((sheet) => (sheet.actualRowCount ?? sheet.rowCount) > 1) ?? wb.worksheets[0];
  if (!ws) {
    return { periodStart: null, periodEnd: null, rows: [], notes: ["Keine Tabelle in der Datei gefunden."] };
  }

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

  if (rawRows.length === 0) {
    return { periodStart: null, periodEnd: null, rows: [], notes: ["Die Datei enthält keine Zeilen."] };
  }

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

  if (headerRowIdx === -1 || bestCount < 3) {
    return {
      periodStart: null,
      periodEnd: null,
      rows: [],
      notes: [
        "Konnte keine Datums-Kopfzeile erkennen. Erwartet wird eine Zeile mit Datums- oder Tagesangaben (eine Spalte je Tag). Bei reinen Tageszahlen bitte den Monat oben auswählen.",
      ],
    };
  }

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

  const sortedDates = headerDates.filter((d): d is string => Boolean(d)).sort();
  const periodStart = sortedDates[0] ?? null;
  const periodEnd = sortedDates[sortedDates.length - 1] ?? null;

  if (rows.length === 0) {
    notes.push("Kopfzeile erkannt, aber keine Mitarbeiterzeilen mit Werten gefunden.");
  }
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
