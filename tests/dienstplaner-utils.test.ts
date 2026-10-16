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

test("generateAutoPlanSlots stops favouring continuity once the employee already hit their target", () => {
  // Mitarbeiter 1 hat mit einer 8h-Schicht am 09.04. sein Wochen- UND
  // Monatssoll (8h) bereits zu 100% erreicht und würde am 10.04. direkt
  // anschließen (Block-Kontinuität). Mitarbeiter 2 hat noch Luft (nur 88.9%
  // seines etwas höheren Solls) und keinen anschließenden Block — die
  // Fairness-Lücke (~11 Punkte) ist kleiner als der frühere Kontinuitäts-
  // Bonus (18 Punkte) und hätte Mitarbeiter 1 trotz voll erreichtem Soll
  // gewinnen lassen. Erwartetes Verhalten: Mitarbeiter 2 (noch unter Soll)
  // wird bevorzugt, sobald Mitarbeiter 1 sein Soll erreicht hat.
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: "Serviceleitung", monthly_hours: 8, weekly_hours: 8 },
      { id: 2, position: "Serviceleitung", monthly_hours: 9, weekly_hours: 9 },
    ],
    existingShifts: [
      { employee_id: 1, shift_date: "2026-04-09", start_time: "09:00", end_time: "17:00" },
      { employee_id: 2, shift_date: "2026-04-13", start_time: "09:00", end_time: "17:00" },
    ],
    availability: [],
    slots: [
      { shift_date: "2026-04-10", position: "Serviceleitung", start_time: "09:00", end_time: "13:00" },
    ],
    pauseRules: [],
  });

  assert.equal(result.plannedShifts.length, 1);
  assert.equal(result.plannedShifts[0]?.employee_id, 2);
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

test("generateAutoPlanSlots never double-books an employee with an existing shift that day", () => {
  const result = generateAutoPlanSlots({
    employees: [{ id: 1, position: null, monthly_hours: 160, weekly_hours: 40 }],
    existingShifts: [{ employee_id: 1, shift_date: "2026-04-10", start_time: "10:00", end_time: "14:00" }],
    availability: [],
    slots: [{ shift_date: "2026-04-10", position: null, start_time: "16:00", end_time: "22:00" }],
    pauseRules: [],
  });
  assert.equal(result.plannedShifts.length, 0);
  assert.match(result.unfilledSlots[0]?.reason ?? "", /schon eingeplant/);
});

test("generateAutoPlanSlots enforces the minimum rest time between shifts", () => {
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: null, monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: null, monthly_hours: 160, weekly_hours: 40 },
    ],
    existingShifts: [{ employee_id: 1, shift_date: "2026-04-09", start_time: "16:00", end_time: "23:30" }],
    availability: [],
    slots: [{ shift_date: "2026-04-10", position: null, start_time: "08:00", end_time: "14:00" }],
    pauseRules: [],
  });
  assert.equal(result.plannedShifts.length, 1);
  assert.equal(result.plannedShifts[0]?.employee_id, 2);
});

test("generateAutoPlanSlots limits consecutive working days", () => {
  const days = ["2026-04-01", "2026-04-02", "2026-04-03"];
  const result = generateAutoPlanSlots({
    employees: [{ id: 1, position: null, monthly_hours: 160, weekly_hours: 40 }],
    existingShifts: [],
    availability: [],
    slots: days.map((shift_date) => ({ shift_date, position: null, start_time: "10:00", end_time: "16:00" })),
    pauseRules: [],
    maxConsecutiveDays: 2,
  });
  assert.equal(result.plannedShifts.length, 2);
  assert.equal(result.unfilledSlots.length, 1);
});

test("generateAutoPlanSlots repairs a blocked slot by moving another assignment", () => {
  // Slot A (Projektion, nur Emp 1 oder 2) wird zuerst chronologisch Emp 1 zugewiesen;
  // Slot B am selben Tag kann nur Emp 1 (Emp 2 hat frei). Ohne Umbuchung bliebe B offen.
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: null, monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: null, monthly_hours: 160, weekly_hours: 40 },
    ],
    existingShifts: [],
    availability: [
      { employee_id: 2, availability_date: "2026-04-10", status: "fix", fixed_start: "16:00", fixed_end: "23:00" },
    ],
    slots: [
      { id: 11, shift_date: "2026-04-10", position: null, start_time: "10:00", end_time: "16:00" },
      { id: 12, shift_date: "2026-04-10", position: null, start_time: "17:00", end_time: "22:00" },
    ],
    pauseRules: [],
  });
  assert.equal(result.unfilledSlots.length, 0);
  assert.equal(result.plannedShifts.length, 2);
  const byId = new Map(result.plannedShifts.map((s) => [s.slot_id, s.employee_id]));
  assert.equal(byId.get(11), 1);
  assert.equal(byId.get(12), 2);
});

test("generateAutoPlanSlots respects rest time against shifts of the neighbouring month", () => {
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: null, monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: null, monthly_hours: 160, weekly_hours: 40 },
    ],
    existingShifts: [
      { employee_id: 1, shift_date: "2026-03-31", start_time: "16:00", end_time: "23:30", context: true },
    ],
    availability: [],
    slots: [{ shift_date: "2026-04-01", position: null, start_time: "08:00", end_time: "14:00" }],
    pauseRules: [],
  });
  assert.equal(result.plannedShifts[0]?.employee_id, 2);
});

test("generateAutoPlanSlots does not count neighbouring-month shifts towards the monthly target", () => {
  // Mitarbeiter 1 hat viele Kontext-Schichten, soll aber nicht als "ausgelastet" gelten.
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: null, monthly_hours: 100, weekly_hours: 25 },
      { id: 2, position: null, monthly_hours: 100, weekly_hours: 25 },
    ],
    existingShifts: [
      { employee_id: 2, shift_date: "2026-04-05", start_time: "10:00", end_time: "18:00" },
      { employee_id: 1, shift_date: "2026-03-25", start_time: "10:00", end_time: "18:00", context: true },
      { employee_id: 1, shift_date: "2026-03-26", start_time: "10:00", end_time: "18:00", context: true },
    ],
    availability: [],
    slots: [{ shift_date: "2026-04-20", position: null, start_time: "10:00", end_time: "16:00" }],
    pauseRules: [],
  });
  assert.equal(result.plannedShifts[0]?.employee_id, 1);
});

test("generateAutoPlanSlots balances hours across equally suited employees", () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({
    shift_date: `2026-04-${String(10 + i * 2).padStart(2, "0")}`,
    position: null,
    start_time: "10:00",
    end_time: "16:00",
  }));
  const result = generateAutoPlanSlots({
    employees: [
      { id: 1, position: null, monthly_hours: 160, weekly_hours: 40 },
      { id: 2, position: null, monthly_hours: 160, weekly_hours: 40 },
    ],
    existingShifts: [],
    availability: [],
    slots,
    pauseRules: [],
  });
  const counts = new Map<number, number>();
  for (const shift of result.plannedShifts) counts.set(shift.employee_id, (counts.get(shift.employee_id) ?? 0) + 1);
  assert.equal(result.plannedShifts.length, 6);
  assert.equal(counts.get(1), 3);
  assert.equal(counts.get(2), 3);
});
