// tests/dienstplaner-schedule-xlsx.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { extractScheduleFromXlsx } from "../src/lib/dienstplaner/schedule-xlsx";

async function buildSampleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Plan");

  // Kopfzeile: Mitarbeiter als Spaltenüberschriften (Spalte A = Datum).
  ws.addRow(["", "Anna Weber", "Bob Klein", "Cara Lang"]);
  // Rollenzeile direkt darunter.
  ws.addRow(["", "Serviceleitung", "Projektion", "Projektion"]);

  // 01.06.2026: Anna 09:00-17:00 (+ Notiz), Bob 16:00-00:00, Cara frei.
  ws.addRow(["01.06.2026", "09:00", "16:00", ""]);
  ws.addRow(["", "17:00", "00:00", ""]);
  ws.addRow(["", "Uni bis 18", "", ""]);

  // 02.06.2026: nur Cara 12:00-20:00.
  ws.addRow(["02.06.2026", "", "", "12:00"]);
  ws.addRow(["", "", "", "20:00"]);

  // 03.06.2026: Anna 10:00-18:00.
  ws.addRow(["03.06.2026", "10:00", "", ""]);
  ws.addRow(["", "18:00", "", ""]);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

test("extractScheduleFromXlsx reconstructs a matrix plan from an Excel workbook", async () => {
  const buffer = await buildSampleWorkbook();
  const employees = [
    { id: 1, name: "Anna Weber" },
    { id: 2, name: "Bob Klein" },
    { id: 3, name: "Cara Lang" },
  ];

  const res = await extractScheduleFromXlsx({ data: buffer, employees, fallbackYear: 2026 });

  assert.equal(res.rows.length, 4);
  assert.equal(res.periodStart, "2026-06-01");
  assert.equal(res.periodEnd, "2026-06-03");

  const anna1 = res.rows.find((r) => r.date === "2026-06-01" && r.rawName === "Anna Weber");
  assert.equal(anna1?.startTime, "09:00");
  assert.equal(anna1?.endTime, "17:00");
  assert.equal(anna1?.matchedEmployeeId, 1);
  assert.equal(anna1?.position, "Serviceleitung");
  assert.equal(anna1?.comment, "Uni bis 18");

  const bob1 = res.rows.find((r) => r.date === "2026-06-01" && r.rawName === "Bob Klein");
  assert.equal(bob1?.endTime, "00:00");
  assert.equal(bob1?.comment, null);

  assert.equal(
    res.rows.some((r) => r.date === "2026-06-01" && r.rawName === "Cara Lang"),
    false
  );

  const cara2 = res.rows.find((r) => r.date === "2026-06-02" && r.rawName === "Cara Lang");
  assert.equal(cara2?.startTime, "12:00");
  assert.equal(cara2?.endTime, "20:00");

  const anna3 = res.rows.find((r) => r.date === "2026-06-03" && r.rawName === "Anna Weber");
  assert.equal(anna3?.startTime, "10:00");
  assert.equal(anna3?.endTime, "18:00");
});

test("extractScheduleFromXlsx uses the second worksheet when the first is a cover sheet", async () => {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet("Deckblatt");
  cover.addRow(["Dienstplan Juni 2026"]);
  cover.addRow(["Erstellt am 01.05.2026"]);

  const ws = wb.addWorksheet("Plan");
  ws.addRow(["", "Anna Weber", "Bob Klein"]);
  ws.addRow(["", "Serviceleitung", "Projektion"]);
  ws.addRow(["01.06.2026", "09:00", "16:00"]);
  ws.addRow(["", "17:00", "00:00"]);
  ws.addRow(["02.06.2026", "", ""]);
  ws.addRow(["03.06.2026", "10:00", ""]);
  ws.addRow(["", "18:00", ""]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const employees = [
    { id: 1, name: "Anna Weber" },
    { id: 2, name: "Bob Klein" },
  ];

  const res = await extractScheduleFromXlsx({ data: buffer, employees, fallbackYear: 2026 });

  assert.equal(res.rows.length, 3);
  const anna = res.rows.find((r) => r.rawName === "Anna Weber");
  assert.equal(anna?.startTime, "09:00");
  assert.equal(anna?.endTime, "17:00");
  assert.ok(res.notes.some((n) => n.includes("Plan")));
});

test("extractScheduleFromXlsx handles formula-based dates and custom-numFmt time numbers", async () => {
  // Reproduziert ein reales Dienstplan-Layout: die Datumszelle ist eine
  // Formel, die auf eine andere Zelle verweist (cell.value = {formula,
  // result: Date}) und über die "obere" und "untere" Zeile eines Datums
  // identisch wiederholt wird (visuell über 2 Zeilen zusammengeführt).
  // Die Uhrzeiten stehen als reine Zahl (z.B. 900) mit Custom-Zahlenformat
  // `00":"00`, das beim Anzeigen in "09:00" aufgeteilt wird.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Plan");
  ws.getRow(1).values = [null, "Anna Weber", "Bob Klein"];
  ws.getRow(2).values = [null, "Serviceleitung", "Projektion"];

  const day1 = new Date(Date.UTC(2026, 5, 1));
  const day2 = new Date(Date.UTC(2026, 5, 2));

  ws.getRow(3).getCell(1).value = { formula: "Verwaltung!B2", result: day1 };
  ws.getRow(3).getCell(2).value = 900; // 09:00
  ws.getRow(3).getCell(2).numFmt = '00":"00';
  ws.getRow(3).getCell(3).value = 1600; // 16:00
  ws.getRow(3).getCell(3).numFmt = '00":"00';

  ws.getRow(4).getCell(1).value = { formula: "Verwaltung!B2", result: day1 }; // gleiches Datum, 2. Zeile
  ws.getRow(4).getCell(2).value = 1700; // 17:00
  ws.getRow(4).getCell(2).numFmt = '00":"00';
  ws.getRow(4).getCell(3).value = 0; // 00:00
  ws.getRow(4).getCell(3).numFmt = '00":"00';

  ws.getRow(5).getCell(1).value = { formula: "A3+1", result: day2 };
  ws.getRow(5).getCell(3).value = 1200; // 12:00
  ws.getRow(5).getCell(3).numFmt = '00":"00';

  ws.getRow(6).getCell(1).value = { formula: "A3+1", result: day2 }; // gleiches Datum
  ws.getRow(6).getCell(3).value = 2000; // 20:00
  ws.getRow(6).getCell(3).numFmt = '00":"00';

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const employees = [
    { id: 1, name: "Anna Weber" },
    { id: 2, name: "Bob Klein" },
  ];

  const res = await extractScheduleFromXlsx({ data: buffer, employees, fallbackYear: 2026 });

  assert.equal(res.periodStart, "2026-06-01");
  assert.equal(res.periodEnd, "2026-06-02");

  const anna1 = res.rows.find((r) => r.date === "2026-06-01" && r.rawName === "Anna Weber");
  assert.equal(anna1?.startTime, "09:00");
  assert.equal(anna1?.endTime, "17:00");

  const bob1 = res.rows.find((r) => r.date === "2026-06-01" && r.rawName === "Bob Klein");
  assert.equal(bob1?.startTime, "16:00");
  assert.equal(bob1?.endTime, "00:00");

  const bob2 = res.rows.find((r) => r.date === "2026-06-02" && r.rawName === "Bob Klein");
  assert.equal(bob2?.startTime, "12:00");
  assert.equal(bob2?.endTime, "20:00");

  // Kein Phantom-Band durch die wiederholte Datumszeile.
  assert.equal(res.rows.length, 3);
});

test("extractScheduleFromXlsx reports notes when no matrix is recognizable", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Empty");
  ws.addRow(["nur", "ein", "paar", "Wörter"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const res = await extractScheduleFromXlsx({
    data: buffer,
    employees: [
      { id: 1, name: "Anna Weber" },
      { id: 2, name: "Bob Klein" },
    ],
    fallbackYear: 2026,
  });

  assert.equal(res.rows.length, 0);
  assert.ok(res.notes.length > 0);
});
