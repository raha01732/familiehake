// tests/dienstplaner-availability-xlsx.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseAvailabilityWorkbook } from "../src/lib/dienstplaner/availability-xlsx";

test("parseAvailabilityWorkbook reads a single-sheet availability list", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Verfügbarkeit");
  ws.addRow(["Name", "01.06.2026", "02.06.2026", "03.06.2026"]);
  ws.addRow(["Anna Weber", "U", "U", ""]);
  ws.addRow(["Bob Klein", "", "K", "9-14"]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const employees = [
    { id: 1, name: "Anna Weber" },
    { id: 2, name: "Bob Klein" },
  ];

  const res = await parseAvailabilityWorkbook(buffer, employees, {});
  assert.equal(res.rows.length, 2);
  const anna = res.rows.find((r) => r.rawName === "Anna Weber");
  assert.equal(anna?.entries.length, 2);
  assert.equal(anna?.entries[0].status, "U");
  const bob = res.rows.find((r) => r.rawName === "Bob Klein");
  const fix = bob?.entries.find((e) => e.date === "2026-06-03");
  assert.equal(fix?.status, "fix");
  assert.equal(fix?.fixedStart, "09:00");
  assert.equal(fix?.fixedEnd, "14:00");
});

test("parseAvailabilityWorkbook uses the second worksheet when the first is a cover sheet", async () => {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet("Deckblatt");
  cover.addRow(["Verfügbarkeiten Juni 2026"]);
  cover.addRow(["Bitte bis 25.05. ausfüllen"]);

  const ws = wb.addWorksheet("Liste");
  ws.addRow(["Name", "01.06.2026", "02.06.2026", "03.06.2026"]);
  ws.addRow(["Anna Weber", "U", "", "F"]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const employees = [{ id: 1, name: "Anna Weber" }];

  const res = await parseAvailabilityWorkbook(buffer, employees, {});
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].entries.length, 2);
  assert.ok(res.notes.some((n) => n.includes("Liste")));
});

test("parseAvailabilityWorkbook reports a note when no sheet has a recognizable header", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leer");
  ws.addRow(["nur", "ein", "paar", "Wörter"]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const res = await parseAvailabilityWorkbook(buffer, [{ id: 1, name: "Anna Weber" }], {});
  assert.equal(res.rows.length, 0);
  assert.ok(res.notes.length > 0);
});
