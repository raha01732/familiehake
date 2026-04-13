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

test("generateAutoPlanSlots uses weekly and monthly balancing while keeping serviceleitung at 8h", () => {
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

  assert.equal(result.length, 1);
  assert.equal(result[0]?.employee_id, 2);
  assert.equal(result[0]?.start_time, "09:00");
  assert.equal(result[0]?.end_time, "17:00");
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

  assert.equal(result.length, 0);
});
