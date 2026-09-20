// src/lib/dienstplaner/schedule-xlsx.ts
// Liest einen hochgeladenen Excel-Dienstplan ein (Matrix-Layout wie der
// PDF-Altdienstplan-Import: Mitarbeiter als Spaltenüberschriften, Datum als
// Zeilenkopf links, je Tag mehrere Zeilen mit Start-/Endzeit in der Spalte
// des Mitarbeiters). Server-only (verwendet exceljs).
import ExcelJS from "exceljs";
import { matchEmployeeName, normalizeName, type NameMatchInput } from "./name-match";
import { normalizeHm, normalizeIsoDate } from "./schedule-parse";
import { cellToText } from "./availability-xlsx";
import type { ParsedScheduleResult, ParsedScheduleRow } from "./import-types";

const MAX_ROWS = 500;
// Manche Pläne haben pro Mitarbeiter mehrere Spalten (Zeit, Ist-Stunden,
// Status, Reserve …), daher großzügig bemessen.
const MAX_COLS = 300;
const MAX_HEADER_SCAN = 6;
const MAX_BAND_ROWS = 4;
const ROLE_RE = /(leitung|projektion|service)/i;
const DECIMAL_RE = /^\d{1,3}([,.]\d{1,2})?$/; // Stundenwerte wie "7,50", "8,00"
const TIME_CELL_RE = /^\d{1,2}[:.]\d{2}$/;

function isCommentFragment(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false; // F/U/K, Satzzeichen
  if (TIME_CELL_RE.test(t)) return false;
  if (DECIMAL_RE.test(t)) return false;
  if (ROLE_RE.test(t) && t.length < 40) return false;
  return true;
}

type EmployeeColumn = { col: number; empId: number; name: string };

type SheetResult = {
  sheetName: string;
  rows: ParsedScheduleRow[];
  empColsCount: number;
};

/**
 * Versucht, aus EINEM Arbeitsblatt eine Schicht-Matrix zu lesen. Gibt null
 * zurück, wenn das Blatt keine erkennbare Mitarbeiter-Kopfzeile bzw.
 * Datumsspalte hat (z.B. ein Deckblatt oder eine Zusammenfassung) — dann
 * probiert der Aufrufer das nächste Blatt.
 */
function parseWorksheet(
  ws: ExcelJS.Worksheet,
  employees: NameMatchInput[],
  fallbackYear: number
): SheetResult | null {
  const rawRows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (rawRows.length >= MAX_ROWS) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > MAX_COLS) return;
      cells[col - 1] = cellToText(cell);
    });
    rawRows.push(cells);
  });
  if (rawRows.length === 0) return null;

  // Kopfzeile = Zeile mit den meisten erkennbaren Mitarbeiternamen.
  let headerRowIdx = -1;
  let empCols: EmployeeColumn[] = [];
  for (let i = 0; i < Math.min(rawRows.length, MAX_HEADER_SCAN); i += 1) {
    const row = rawRows[i];
    const hits: EmployeeColumn[] = [];
    for (let c = 0; c < row.length; c += 1) {
      const text = (row[c] ?? "").trim();
      if (!text) continue;
      const target = normalizeName(text);
      if (!target) continue;
      const emp = employees.find((e) => {
        const en = normalizeName(e.name);
        return en === target || en.includes(target) || target.includes(en);
      });
      if (emp) hits.push({ col: c, empId: emp.id, name: emp.name });
    }
    if (hits.length > empCols.length) {
      empCols = hits;
      headerRowIdx = i;
    }
  }
  if (headerRowIdx === -1 || empCols.length < 2) return null;
  empCols.sort((a, b) => a.col - b.col);
  const firstEmpCol = empCols[0].col;

  // Datumsspalte = Spalte links der Mitarbeiterspalten mit den meisten
  // erkennbaren Datumswerten unterhalb der Kopfzeile.
  let dateCol = -1;
  let dateColCount = 0;
  for (let c = 0; c < firstEmpCol; c += 1) {
    let count = 0;
    for (let r = headerRowIdx + 1; r < rawRows.length; r += 1) {
      if (normalizeIsoDate(rawRows[r]?.[c], fallbackYear)) count += 1;
    }
    if (count > dateColCount) {
      dateColCount = count;
      dateCol = c;
    }
  }
  if (dateCol === -1 || dateColCount < 3) return null;

  // Rollen-Zeile direkt unter der Kopfzeile (optional).
  const roleByEmp = new Map<number, string>();
  const roleRowIdx = headerRowIdx + 1;
  const roleRow = rawRows[roleRowIdx];
  if (roleRow) {
    const roleHits = empCols.filter((ec) => ROLE_RE.test((roleRow[ec.col] ?? "").trim())).length;
    if (roleHits >= Math.max(1, Math.ceil(empCols.length / 2))) {
      for (const ec of empCols) {
        const text = (roleRow[ec.col] ?? "").trim();
        if (ROLE_RE.test(text) && text.length < 40) roleByEmp.set(ec.empId, text);
      }
    }
  }

  // Datumsbänder: jede Zeile mit erkanntem Datum in dateCol eröffnet ein
  // neues Band; nachfolgende Zeilen ohne eigenes Datum gehören dazu.
  // Manche Dateien wiederholen das Datum der oberen Zeile eines Bandes auch
  // in der/den Folgezeile(n) (z.B. bei einer über 2 Zeilen zusammengeführten
  // Datumszelle) — nur ein DIFFERENTES Datum eröffnet ein neues Band, ein
  // gleiches oder fehlendes Datum gehört zum laufenden Band dazu.
  type Band = { date: string; rows: number[] };
  const bands: Band[] = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r += 1) {
    const date = normalizeIsoDate(rawRows[r]?.[dateCol], fallbackYear);
    const last = bands[bands.length - 1];
    if (date && (!last || date !== last.date)) {
      bands.push({ date, rows: [r] });
      continue;
    }
    const hasContent = date != null || (rawRows[r] ?? []).some((v) => (v ?? "").trim());
    if (last && hasContent && last.rows.length < MAX_BAND_ROWS) {
      last.rows.push(r);
    }
  }

  const rows: ParsedScheduleRow[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const band of bands) {
    for (const ec of empCols) {
      const times: string[] = [];
      const noteParts: string[] = [];
      for (const r of band.rows) {
        const text = (rawRows[r]?.[ec.col] ?? "").trim();
        if (!text) continue;
        const t = TIME_CELL_RE.test(text) ? normalizeHm(text) : null;
        if (t) {
          if (times.length < 2 && !times.includes(t)) times.push(t);
        } else if (isCommentFragment(text)) {
          if (!noteParts.includes(text)) noteParts.push(text);
        }
      }
      if (times.length === 0) continue;

      const match = matchEmployeeName(ec.name, employees);
      const matchedId = match.matchedEmployeeId ?? ec.empId;
      const dedupKey = `${band.date}|${matchedId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let comment = noteParts.join(" ").replace(/\s+/g, " ").trim();
      if (comment.length > 240) comment = comment.slice(0, 240).trim();

      idx += 1;
      rows.push({
        rowIndex: idx,
        date: band.date,
        rawName: ec.name,
        matchedEmployeeId: matchedId,
        matchConfidence: match.matchedEmployeeId ? match.matchConfidence : "exact",
        matchCandidates: match.matchCandidates,
        position: roleByEmp.get(ec.empId) ?? null,
        startTime: times[0] ?? null,
        endTime: times[1] ?? null,
        comment: comment || null,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.rawName.localeCompare(b.rawName, "de"));
  for (let i = 0; i < rows.length; i += 1) rows[i] = { ...rows[i], rowIndex: i + 1 };

  return { sheetName: ws.name, rows, empColsCount: empCols.length };
}

/**
 * Liest Schichten aus einer Excel-Matrix (Mitarbeiter=Spalten, Datum=Zeilen).
 * Analog zur deterministischen PDF-Textebenen-Extraktion, aber direkt über
 * die tatsächlichen Zellkoordinaten statt geclusterter x/y-Positionen.
 *
 * Die Datei kann mehrere Arbeitsblätter enthalten (z.B. ein Deckblatt vor
 * dem eigentlichen Plan) — jedes Blatt wird versucht, das mit den meisten
 * erkannten Schichten gewinnt.
 */
export async function extractScheduleFromXlsx(params: {
  data: ArrayBuffer | Buffer;
  employees: NameMatchInput[];
  fallbackYear: number;
}): Promise<ParsedScheduleResult> {
  const { employees, fallbackYear } = params;
  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(params.data) ? params.data : Buffer.from(params.data);
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  if (wb.worksheets.length === 0) {
    return { periodStart: null, periodEnd: null, rows: [], notes: ["Keine Tabelle in der Datei gefunden."] };
  }
  if (employees.length < 2) {
    return {
      periodStart: null,
      periodEnd: null,
      rows: [],
      notes: ["Zu wenig angelegte Mitarbeiter, um Spalten sicher zuzuordnen."],
    };
  }

  let best: SheetResult | null = null;
  for (const ws of wb.worksheets) {
    const parsed = parseWorksheet(ws, employees, fallbackYear);
    if (!parsed) continue;
    if (!best || parsed.rows.length > best.rows.length) best = parsed;
  }

  const notes: string[] = [];
  if (!best || best.rows.length === 0) {
    const sheetHint =
      wb.worksheets.length > 1
        ? ` (geprüfte Arbeitsblätter: ${wb.worksheets.map((s) => s.name).join(", ")})`
        : "";
    notes.push(
      "Es konnten keine Schichten aus der Excel-Datei gelesen werden. Erwartet wird eine Matrix mit " +
        `Mitarbeitern als Spalten und Datum als Zeilen (Start-/Endzeit je Zelle)${sheetHint}.`
    );
    return { periodStart: null, periodEnd: null, rows: [], notes };
  }

  const rows = best.rows;
  if (wb.worksheets.length > 1) {
    notes.push(`Arbeitsblatt "${best.sheetName}" verwendet (von ${wb.worksheets.length} Blättern in der Datei).`);
  }
  notes.push(
    `Deterministisch aus der Excel-Tabelle gelesen (${rows.length} Schichten, ${best.empColsCount} Mitarbeiterspalten). Bitte stichprobenartig prüfen.`
  );
  const unmatched = rows.filter((r) => !r.matchedEmployeeId).length;
  if (unmatched > 0) {
    notes.push(`${unmatched} von ${rows.length} Namen ohne sichere Zuordnung — bitte im Review prüfen.`);
  }

  const dates = rows.map((r) => r.date).sort();
  return {
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    rows,
    notes,
  };
}
