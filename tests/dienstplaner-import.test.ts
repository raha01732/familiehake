// tests/dienstplaner-import.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { matchEmployeeName, normalizeName } from "../src/lib/dienstplaner/name-match";
import {
  mapAvailabilityCell,
  parseHeaderDate,
  parseTimeRange,
} from "../src/lib/dienstplaner/availability-parse";
import {
  normalizeHm,
  normalizeIsoDate,
  parseLooseJson,
} from "../src/lib/dienstplaner/schedule-parse";
import {
  buildHistoryPromptBlock,
  computeHistoryInsights,
  type HistoryShift,
} from "../src/lib/dienstplaner/history-insights";

test("normalizeName strips case, diacritics and punctuation", () => {
  assert.equal(normalizeName("Müller, Jörg"), "muller jorg");
  assert.equal(normalizeName("  Anna-Lena   Weiß "), "anna lena weiss");
});

test("matchEmployeeName resolves exact and reordered names", () => {
  const employees = [
    { id: 1, name: "Anna Weber" },
    { id: 2, name: "Jörg Müller" },
    { id: 3, name: "Tim Schmitt" },
  ];
  assert.equal(matchEmployeeName("Anna Weber", employees).matchedEmployeeId, 1);
  assert.equal(matchEmployeeName("Anna Weber", employees).matchConfidence, "exact");

  const reordered = matchEmployeeName("Müller, Jörg", employees);
  assert.equal(reordered.matchedEmployeeId, 2);
  assert.ok(reordered.matchConfidence === "high" || reordered.matchConfidence === "exact");
});

test("matchEmployeeName flags unknown names as none", () => {
  const employees = [{ id: 1, name: "Anna Weber" }];
  const res = matchEmployeeName("Xaver Zwiebel", employees);
  assert.equal(res.matchedEmployeeId, null);
  assert.equal(res.matchConfidence, "none");
});

test("mapAvailabilityCell maps known keywords", () => {
  assert.equal(mapAvailabilityCell("Urlaub").status, "U");
  assert.equal(mapAvailabilityCell("k").status, "K");
  assert.equal(mapAvailabilityCell("X").status, "F");
  assert.equal(mapAvailabilityCell("fr").status, "fr");
  assert.equal(mapAvailabilityCell("Spät").status, "sp");
});

test("mapAvailabilityCell parses time ranges to fix", () => {
  const a = mapAvailabilityCell("9-14");
  assert.equal(a.status, "fix");
  assert.equal(a.fixedStart, "09:00");
  assert.equal(a.fixedEnd, "14:00");

  const b = mapAvailabilityCell("09:30 - 16:00 Uhr");
  assert.equal(b.status, "fix");
  assert.equal(b.fixedStart, "09:30");
  assert.equal(b.fixedEnd, "16:00");
});

test("mapAvailabilityCell marks empty as available and unknown as unmapped", () => {
  const empty = mapAvailabilityCell("   ");
  assert.equal(empty.status, null);
  assert.equal(empty.mapped, true);

  const weird = mapAvailabilityCell("???");
  assert.equal(weird.status, null);
  assert.equal(weird.mapped, false);
});

test("parseTimeRange rejects invalid clock values", () => {
  assert.equal(parseTimeRange("25-30"), null);
  assert.deepEqual(parseTimeRange("8-12"), { start: "08:00", end: "12:00" });
});

test("parseHeaderDate handles Date, ISO, DD.MM. and bare day numbers", () => {
  assert.equal(parseHeaderDate(new Date(Date.UTC(2026, 3, 7)), null), "2026-04-07");
  assert.equal(parseHeaderDate("2026-04-07", null), "2026-04-07");
  assert.equal(parseHeaderDate("7.4.2026", null), "2026-04-07");
  assert.equal(parseHeaderDate("07.04.", "2026-04"), "2026-04-07");
  assert.equal(parseHeaderDate("Mo 7", "2026-04"), "2026-04-07");
  assert.equal(parseHeaderDate(7, "2026-04"), "2026-04-07");
  assert.equal(parseHeaderDate(7, null), null);
});

test("normalizeIsoDate + normalizeHm", () => {
  assert.equal(normalizeIsoDate("14.02.2026"), "2026-02-14");
  assert.equal(normalizeIsoDate("14.02.", 2026), "2026-02-14");
  assert.equal(normalizeIsoDate("nope"), null);
  assert.equal(normalizeHm("9"), "09:00");
  assert.equal(normalizeHm("9:5"), "09:05");
  assert.equal(normalizeHm("18.30"), "18:30");
  assert.equal(normalizeHm("99"), null);
});

test("parseLooseJson recovers from surrounding prose and code fences", () => {
  assert.deepEqual(parseLooseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLooseJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(parseLooseJson('hier: {"a":3} danke'), { a: 3 });
});

function sampleHistory(): HistoryShift[] {
  const rows: HistoryShift[] = [];
  // 3 Freitage mit je 3 Schichten, 3 Montage mit je 1 Schicht
  const fridays = ["2026-05-01", "2026-05-08", "2026-05-15"];
  const mondays = ["2026-05-04", "2026-05-11", "2026-05-18"];
  for (const d of fridays) {
    rows.push({ shift_date: d, employee_name: "Anna Weber", employee_id: 1, position: "Serviceleitung", start_time: "16:00", end_time: "23:00" });
    rows.push({ shift_date: d, employee_name: "Tim Schmitt", employee_id: 3, position: "Projektion", start_time: "18:00", end_time: "23:00" });
    rows.push({ shift_date: d, employee_name: "Jörg Müller", employee_id: 2, position: "Projektion", start_time: "18:00", end_time: "23:00" });
  }
  for (const d of mondays) {
    rows.push({ shift_date: d, employee_name: "Anna Weber", employee_id: 1, position: "Serviceleitung", start_time: "12:00", end_time: "18:00" });
  }
  return rows;
}

test("computeHistoryInsights aggregates weekday headcount and affinity", () => {
  const insights = computeHistoryInsights(sampleHistory());
  assert.equal(insights.totalShifts, 12);
  assert.equal(insights.distinctDays, 6);

  const friday = insights.weekdayHeadcount.find((w) => w.weekday === 5);
  assert.ok(friday);
  assert.equal(friday?.avgHeadcount, 3);
  const monday = insights.weekdayHeadcount.find((w) => w.weekday === 1);
  assert.equal(monday?.avgHeadcount, 1);

  const topTime = insights.commonTimes[0];
  assert.equal(`${topTime.start}-${topTime.end}`, "18:00-23:00");

  const anna = insights.employeeAffinity.find(
    (a) => a.employeeName === "Anna Weber" && a.position === "Serviceleitung"
  );
  assert.equal(anna?.count, 6);
});

test("buildHistoryPromptBlock stays empty below the data threshold", () => {
  assert.equal(buildHistoryPromptBlock(computeHistoryInsights(sampleHistory().slice(0, 3))), "");
  const full = buildHistoryPromptBlock(computeHistoryInsights(sampleHistory()));
  assert.match(full, /HISTORISCHE_MUSTER/);
  assert.match(full, /Fr:/);
});
