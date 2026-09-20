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
