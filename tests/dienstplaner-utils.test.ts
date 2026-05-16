// /workspace/familiehake/tests/dienstplaner-utils.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { addHoursToTime, generateAutoPlanSlots, getThursdayWeekKey } from "../src/app/tools/dienstplaner/utils";

test("getThursdayWeekKey groups week as Thursday to Wednesday", () => {
  assert.equal(getThursdayWeekKey("2026-04-09"), "2026-04-09");
  assert.equal(getThursdayWeekKey("2026-04-15"), "2026-04-09");
  assert.equal(getThursdayWeekKey("2026-04-16"), "2026-04-16");
});

test("addHoursToTime adds 8 hours and wraps midnight", () => {
  assert.equal(addHoursToTime("09:00", 8), "17:00");
  assert.equal(addHoursToTime("20:30", 8), "04:30");
});

test("generateAutoPlanSlots prefers continuing an existing block over pure fairness", () => {
  // Mitarbeiter 1 hat eine Schicht am 09.04. → Block-Bonus für 10.04.
  // Mitarbeiter 2 hat zwar niedrigere weekly_hours (Fairness-Vorteil),
  // aber keinen anschließenden Block. Erwartetes Verhalten: Block dominiert.
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: "Serviceleitung", monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: "Serviceleitung", monthly_hours: 160, weekly_hours: 20 },
    ],
    existingShifts: [
      { employee_id: 1, shift_date: "2026-04-09", start_time: "09:00", end_time: "17:00" },
    ],
    availability: [],
    slots: [
      { shift_date: "2026-04-10", position: "Serviceleitung", start_time: "09:00", end_time: "13:00" },
    ],
    pauseRules: [],
  });

  assert.equal(result.plannedShifts.length, 1);
  assert.equal(result.plannedShifts[0]?.employee_id, 1);
  // Serviceleitung wird auf 8h verlängert, egal welcher Slot-Endzeit
  assert.equal(result.plannedShifts[0]?.start_time, "09:00");
  assert.equal(result.plannedShifts[0]?.end_time, "17:00");
  assert.equal(result.unfilledSlots.length, 0);
});

test("generateAutoPlanSlots penalises a shift-free-shift gap pattern", () => {
  // Mitarbeiter 1 arbeitet am 09.04. und 11.04. Schichtkandidat ist der
  // 10.04. → eine Zuweisung an einen ANDEREN Mitarbeiter würde Mitarbeiter 1
  // einen einsamen freien Tag mitten in einem Block lassen. Da der Slot aber
  // nur 4h ist, soll Mitarbeiter 1 (Lücke füllen) klar bevorzugt werden.
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: "Serviceleitung", monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: "Serviceleitung", monthly_hours: 160, weekly_hours: 40 },
    ],
    existingShifts: [
      { employee_id: 1, shift_date: "2026-04-09", start_time: "09:00", end_time: "17:00" },
      { employee_id: 1, shift_date: "2026-04-11", start_time: "09:00", end_time: "17:00" },
    ],
    availability: [],
    slots: [
      { shift_date: "2026-04-10", position: "Serviceleitung", start_time: "09:00", end_time: "13:00" },
    ],
    pauseRules: [],
  });

  assert.equal(result.plannedShifts.length, 1);
  assert.equal(result.plannedShifts[0]?.employee_id, 1);
});

test("generateAutoPlanSlots respects allowed_positions", () => {
  // Slot verlangt Projektion. Mitarbeiter 1 ist nur für Serviceleitung
  // freigeschaltet. → unfilledSlots-Report mit Grund.
  const result = generateAutoPlanSlots({
    employees: [
      {
        id: 1,
        position: "Projektion",
        monthly_hours: 160,
        weekly_hours: 40,
        allowed_positions: ["serviceleitung"],
      },
    ],
    existingShifts: [],
    availability: [],
    slots: [
      { shift_date: "2026-04-10", position: "Projektion", start_time: "16:00", end_time: "22:00" },
    ],
    pauseRules: [],
  });

  assert.equal(result.plannedShifts.length, 0);
  assert.equal(result.unfilledSlots.length, 1);
  assert.match(result.unfilledSlots[0]?.reason ?? "", /freigeschaltet|passender Mitarbeiter/i);
});

test("generateAutoPlanSlots respects fixed availability with 8h serviceleitung duration", () => {
  const result = generateAutoPlanSlots({
    employees: [{ id: 1, position: "Serviceleitung", monthly_hours: 160, weekly_hours: 40 }],
    existingShifts: [],
    availability: [
      {
        employee_id: 1,
        availability_date: "2026-04-10",
        status: "fix",
        fixed_start: "09:00",
        fixed_end: "13:00",
      },
    ],
    slots: [{ shift_date: "2026-04-10", position: "Serviceleitung", start_time: "09:00", end_time: "13:00" }],
    pauseRules: [],
  });

  assert.equal(result.plannedShifts.length, 0);
  assert.equal(result.unfilledSlots.length, 1);
});
