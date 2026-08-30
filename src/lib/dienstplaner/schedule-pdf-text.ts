// src/lib/dienstplaner/schedule-pdf-text.ts
// Deterministische Extraktion aus der PDF-Textebene mit Koordinaten.
// Dienstpläne dieses Typs sind Matrizen (Mitarbeiter = Spalten, Datum = Zeilen);
// über die x/y-Positionen der Textfragmente lässt sich die Tabelle exakt
// rekonstruieren, statt eine KI ein gerastertes Riesenbild raten zu lassen.
import { getDocumentProxy } from "unpdf";
import { matchEmployeeName, normalizeName, type NameMatchInput } from "./name-match";
import type { ParsedScheduleResult, ParsedScheduleRow } from "./import-types";

export type PdfTextItem = { str: string; x: number; y: number; w: number; page: number };

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ROLE_RE = /(leitung|projektion|service)/i;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normTime(raw: string): string | null {
  const m = raw.match(TIME_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return `${pad2(h === 24 ? 0 : h)}:${pad2(min)}`;
}

/** Liest alle Textfragmente mit Position aus dem PDF (alle Seiten). */
export async function extractPdfTextItems(data: Uint8Array): Promise<PdfTextItem[]> {
  const pdf = await getDocumentProxy(data);
  const items: PdfTextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      const str = (it.str ?? "").trim();
      if (!str || !it.transform) continue;
      items.push({
        str,
        x: it.transform[4],
        y: it.transform[5], // PDF-Koordinaten: größeres y = weiter oben
        w: it.width ?? 0,
        page: p,
      });
    }
  }
  return items;
}

type Cluster = { center: number; items: PdfTextItem[] };

/** 1D-Clustering entlang einer Achse mit Mindestlücke. */
function cluster(values: PdfTextItem[], axis: "x" | "y", minGap: number): Cluster[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a[axis] - b[axis]);
  const out: Cluster[] = [];
  let bucket: PdfTextItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i][axis] - sorted[i - 1][axis] > minGap) {
      out.push({ center: avg(bucket, axis), items: bucket });
      bucket = [];
    }
    bucket.push(sorted[i]);
  }
  out.push({ center: avg(bucket, axis), items: bucket });
  return out;
}

function avg(items: PdfTextItem[], axis: "x" | "y"): number {
  return items.reduce((s, it) => s + it[axis], 0) / items.length;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Fasst Fragmente einer Zeile zu Zellen zusammen (kleine x-Lücken verbinden). */
function mergeRowCells(row: PdfTextItem[]): { str: string; x: number; cx: number; w: number }[] {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  const cells: { str: string; x: number; cx: number; w: number }[] = [];
  let curStr = "";
  let curX = 0;
  let curEnd = 0;
  for (const it of sorted) {
    if (!curStr) {
      curStr = it.str;
      curX = it.x;
      curEnd = it.x + it.w;
      continue;
    }
    if (it.x - curEnd < 12) {
      curStr += (it.x - curEnd > 1 ? " " : "") + it.str;
      curEnd = it.x + it.w;
    } else {
      cells.push({ str: curStr, x: curX, cx: (curX + curEnd) / 2, w: curEnd - curX });
      curStr = it.str;
      curX = it.x;
      curEnd = it.x + it.w;
    }
  }
  if (curStr) cells.push({ str: curStr, x: curX, cx: (curX + curEnd) / 2, w: curEnd - curX });
  return cells;
}

type PageParse = {
  rows: ParsedScheduleRow[];
  matchedEmployees: number;
  timeColumns: number;
};

function parsePage(
  items: PdfTextItem[],
  employees: NameMatchInput[],
  fallbackYear: number
): PageParse {
  const empty: PageParse = { rows: [], matchedEmployees: 0, timeColumns: 0 };
  if (items.length === 0) return empty;

  // ── Datumszeilen finden ────────────────────────────────────────────────
  const dateItems = items
    .filter((it) => DATE_RE.test(it.str) && it.x < 90)
    .sort((a, b) => b.y - a.y);
  if (dateItems.length < 3) return empty;

  // ── Kopfzeile finden: Zeile knapp über der ersten Datumszeile mit den
  //    meisten Mitarbeiter-Namen ──────────────────────────────────────────
  const firstDateY = dateItems[0].y;
  const rowClusters = cluster(
    items.filter((it) => it.y > firstDateY - 2),
    "y",
    3
  );

  let nameCenter: { empId: number; cx: number; name: string }[] = [];
  let headerRowY = firstDateY;
  for (const rc of rowClusters.sort((a, b) => a.center - b.center)) {
    const cells = mergeRowCells(rc.items);
    const hits: { empId: number; cx: number; name: string }[] = [];
    for (const emp of employees) {
      const target = normalizeName(emp.name);
      const cell = cells.find((c) => {
        const cn = normalizeName(c.str);
        return cn === target || cn.includes(target) || target.includes(cn);
      });
      if (cell) hits.push({ empId: emp.id, cx: cell.cx, name: emp.name });
    }
    if (hits.length > nameCenter.length) {
      nameCenter = hits;
      headerRowY = rc.center;
    }
  }
  if (nameCenter.length < 2) return empty;
  nameCenter.sort((a, b) => a.cx - b.cx);

  // ── Zeit-Spalten aus den Daten clustern und Offset zur Kopfzeile messen ─
  const bodyTimes = items.filter(
    (it) => TIME_RE.test(it.str) && it.x > 90 && it.y < firstDateY + 8
  );
  const timeCols = cluster(bodyTimes, "x", 22).filter((c) => c.items.length >= 2);
  if (timeCols.length < 2) return empty;

  const offsets: number[] = [];
  for (const tc of timeCols) {
    let best = Infinity;
    for (const nc of nameCenter) {
      const d = nc.cx - tc.center;
      if (d > -10 && d < 70 && Math.abs(d) < Math.abs(best)) best = d;
    }
    if (Number.isFinite(best)) offsets.push(best);
  }
  const offset = offsets.length ? median(offsets) : 0;

  // Datenspalten-Mittelpunkte + halbe Spaltenbreite
  const dataCenters = nameCenter.map((nc) => ({
    empId: nc.empId,
    name: nc.name,
    cx: nc.cx - offset,
  }));
  const spacings: number[] = [];
  for (let i = 1; i < dataCenters.length; i += 1) {
    spacings.push(dataCenters[i].cx - dataCenters[i - 1].cx);
  }
  const colSpacing = median(spacings) || 60;
  const halfCol = Math.min(colSpacing / 2, 30);

  // Rollen-Zeile: ROLE_RE-Zeile direkt unter der Kopfzeile (kleineres y,
  // maximal ~12 darunter) — nicht die Titelzeile weiter oben.
  const roleByEmp = new Map<number, string>();
  const roleRow = rowClusters
    .filter(
      (rc) =>
        rc.center < headerRowY &&
        headerRowY - rc.center < 14 &&
        rc.items.some((it) => ROLE_RE.test(it.str))
    )
    .sort((a, b) => b.center - a.center)[0];
  if (roleRow) {
    const roleCells = mergeRowCells(roleRow.items);
    for (const dc of dataCenters) {
      const cell = roleCells.find((c) => Math.abs(c.cx - offset - dc.cx) < colSpacing / 2 + 4);
      if (cell && ROLE_RE.test(cell.str) && cell.str.length < 40) {
        roleByEmp.set(dc.empId, cell.str.trim());
      }
    }
  }

  // ── Datums-Bänder ──────────────────────────────────────────────────────
  const bands = dateItems.map((d, i) => {
    const gapUp = i > 0 ? dateItems[i - 1].y - d.y : 13;
    const gapDown = i < dateItems.length - 1 ? d.y - dateItems[i + 1].y : 13;
    const m = d.str.match(DATE_RE)!;
    const year = Number(m[3]) || fallbackYear;
    return {
      date: `${year}-${m[2]}-${m[1]}`,
      yTop: d.y + gapUp / 2,
      yBot: d.y - gapDown / 2,
    };
  });

  // ── Zeit-Items einsammeln pro (Datum, Mitarbeiter) ─────────────────────
  const timeItems = items.filter((it) => TIME_RE.test(it.str) && it.x > 90);
  const rows: ParsedScheduleRow[] = [];
  let idx = 0;
  for (const band of bands) {
    for (const dc of dataCenters) {
      const inCell = timeItems
        .filter(
          (it) => it.y <= band.yTop && it.y > band.yBot && Math.abs(it.x - dc.cx) < halfCol
        )
        .sort((a, b) => b.y - a.y || a.x - b.x);
      if (inCell.length === 0) continue;

      const times: string[] = [];
      for (const it of inCell) {
        const t = normTime(it.str);
        if (t && !times.includes(t)) times.push(t);
        if (times.length >= 2) break;
      }
      if (times.length === 0) continue;

      idx += 1;
      const match = matchEmployeeName(dc.name, employees);
      rows.push({
        rowIndex: idx,
        date: band.date,
        rawName: dc.name,
        matchedEmployeeId: match.matchedEmployeeId ?? dc.empId,
        matchConfidence: match.matchedEmployeeId ? match.matchConfidence : "exact",
        matchCandidates: match.matchCandidates,
        position: roleByEmp.get(dc.empId) ?? null,
        startTime: times[0] ?? null,
        endTime: times[1] ?? null,
      });
    }
  }

  return { rows, matchedEmployees: nameCenter.length, timeColumns: timeCols.length };
}

/**
 * Rekonstruiert Schichten aus bereits extrahierten Textfragmenten (rein,
 * testbar). Gibt null zurück, wenn keine Matrixstruktur erkennbar ist.
 */
export function parseScheduleTextItems(
  items: PdfTextItem[],
  employees: NameMatchInput[],
  fallbackYear: number
): ParsedScheduleResult | null {
  if (employees.length < 2 || items.length < 10) return null;

  const pages = [...new Set(items.map((it) => it.page))].sort((a, b) => a - b);
  const allRows: ParsedScheduleRow[] = [];
  let matchedEmployees = 0;
  for (const p of pages) {
    const res = parsePage(
      items.filter((it) => it.page === p),
      employees,
      fallbackYear
    );
    matchedEmployees = Math.max(matchedEmployees, res.matchedEmployees);
    allRows.push(...res.rows);
  }

  if (matchedEmployees < 2 || allRows.length === 0) return null;

  // Dedup + Sortierung
  const seen = new Set<string>();
  const rows: ParsedScheduleRow[] = [];
  for (const r of allRows.sort(
    (a, b) => a.date.localeCompare(b.date) || a.rawName.localeCompare(b.rawName, "de")
  )) {
    const key = `${r.date}|${(r.matchedEmployeeId ?? r.rawName).toString().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...r, rowIndex: rows.length + 1 });
  }

  const dates = rows.map((r) => r.date).sort();
  const notes = [
    `Deterministisch aus der PDF-Textebene gelesen (${rows.length} Schichten, ${matchedEmployees} Mitarbeiterspalten). Bitte trotzdem stichprobenartig prüfen.`,
  ];

  return {
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    rows,
    notes,
  };
}

/**
 * Versucht die deterministische Extraktion aus einem PDF. Gibt null zurück,
 * wenn das PDF keine brauchbare Textebene / Matrixstruktur hat (dann Fallback
 * auf die KI).
 */
export async function extractScheduleFromPdfText(params: {
  pdf: Buffer;
  employees: NameMatchInput[];
  fallbackYear: number;
}): Promise<ParsedScheduleResult | null> {
  if (params.employees.length < 2) return null;
  let items: PdfTextItem[];
  try {
    items = await extractPdfTextItems(new Uint8Array(params.pdf));
  } catch {
    return null;
  }
  return parseScheduleTextItems(items, params.employees, params.fallbackYear);
}
