import assert from "node:assert/strict";
import test from "node:test";
import {
  kindOfPosition,
  periodForDate,
  removeCoveredSlots,
  resolvePositionKind,
  slotRequiresLeader,
  slotsForDate,
  type DayRequirement,
  type RulePeriod,
  type ShiftRule,
} from "../src/app/tools/dienstplaner/requirements";
import { generateAutoPlanSlots, isAllowedForCategory } from "../src/app/tools/dienstplaner/utils";

const rule = (overrides: Partial<ShiftRule>): ShiftRule => ({
  id: 1,
  position: "Serviceleitung",
  require_leader: false,
  start_time: "16:00",
  end_time: "00:00",
  weekdays: [1, 2, 3, 4, 5],
  required_count: 1,
  note: null,
  ...overrides,
});

test("slotsForDate expands rules by weekday and count", () => {
  // 2026-04-10 ist ein Freitag, 2026-04-11 ein Samstag
  const rules = [rule({}), rule({ id: 2, position: "Projektion", required_count: 2, weekdays: [5, 6] })];
  const friday = slotsForDate("2026-04-10", rules, []);
  assert.equal(friday.overridden, false);
  assert.deepEqual(
    friday.slots.map((slot) => slot.position),
    ["Projektion", "Projektion", "Serviceleitung"]
  );
  const saturday = slotsForDate("2026-04-11", rules, []);
  assert.equal(saturday.slots.length, 2);
});

test("day overrides replace the weekday rules, count 0 means no demand", () => {
  const rules = [rule({})];
  const overrides: DayRequirement[] = [
    {
      requirement_date: "2026-04-10",
      position: "Projektion",
      require_leader: true,
      start_time: "20:00",
      end_time: "23:00",
      required_count: 1,
      note: null,
    },
    {
      requirement_date: "2026-04-09",
      position: "Kein Bedarf",
      require_leader: false,
      start_time: "00:00",
      end_time: "00:00",
      required_count: 0,
      note: null,
    },
  ];
  const overridden = slotsForDate("2026-04-10", rules, overrides);
  assert.equal(overridden.overridden, true);
  assert.equal(overridden.slots.length, 1);
  assert.equal(overridden.slots[0]?.require_leader, true);

  const closed = slotsForDate("2026-04-09", rules, overrides);
  assert.equal(closed.overridden, true);
  assert.equal(closed.slots.length, 0);

  // anderer Tag bleibt unberührt
  assert.equal(slotsForDate("2026-04-08", rules, overrides).slots.length, 1);
});

test("removeCoveredSlots lets each existing shift cover one slot", () => {
  const slots = [
    { start_time: "16:00", end_time: "00:00" },
    { start_time: "16:00", end_time: "00:00" },
    { start_time: "20:00", end_time: "23:00" },
  ];
  const remaining = removeCoveredSlots(slots, [
    { start_time: "16:00:00", end_time: "00:00:00" },
    { start_time: "20:00", end_time: "22:00" },
  ]);
  assert.deepEqual(remaining, [{ start_time: "16:00", end_time: "00:00" }]);
});

test("position kinds round-trip", () => {
  assert.deepEqual(resolvePositionKind("projektion_leitung", ""), { position: "Projektion", require_leader: true });
  assert.deepEqual(resolvePositionKind("custom", " Kasse "), { position: "Kasse", require_leader: false });
  assert.equal(resolvePositionKind("custom", ""), null);
  assert.equal(kindOfPosition("Projektion", true).kind, "projektion_leitung");
  assert.equal(kindOfPosition("Projektionsleitung", false).kind, "projektion_leitung");
  assert.equal(kindOfPosition("Frühe Serviceleitung", false).kind, "custom");
  assert.equal(slotRequiresLeader("Projektionsleitung", false), true);
  assert.equal(slotRequiresLeader("Projektion", false), false);
});

test("isAllowedForCategory: Projektionsleitung zählt bei Projektion mit, Pflicht nur mit Flag", () => {
  assert.equal(isAllowedForCategory(["projektion"], "projektion"), true);
  assert.equal(isAllowedForCategory(["projektionsleitung"], "projektion"), true);
  assert.equal(isAllowedForCategory(["projektion"], "projektion", true), false);
  assert.equal(isAllowedForCategory(["projektionsleitung"], "projektion", true), true);
  assert.equal(isAllowedForCategory(["serviceleitung"], "projektion"), false);
  assert.equal(isAllowedForCategory(["projektion"], "projektionsleitung"), false);
});

test("auto plan: Projektionsleitung kann normale Projektion übernehmen", () => {
  const result = generateAutoPlanSlots({
    employees: [{ id: 1, position: null, monthly_hours: 100, weekly_hours: 25, allowed_positions: ["projektionsleitung"] }],
    existingShifts: [],
    availability: [],
    slots: [{ shift_date: "2026-04-10", position: "Projektion", start_time: "18:00", end_time: "22:00" }],
    pauseRules: [],
  });
  assert.equal(result.plannedShifts.length, 1);
});

test("auto plan: Leitungs-Pflicht schließt normale Projektion aus und hat Vorrang bei der Verteilung", () => {
  const employees = [
    { id: 1, position: null, monthly_hours: 100, weekly_hours: 25, allowed_positions: ["projektion" as const] },
    { id: 2, position: null, monthly_hours: 100, weekly_hours: 25, allowed_positions: ["projektionsleitung" as const] },
  ];
  const result = generateAutoPlanSlots({
    employees,
    existingShifts: [],
    availability: [],
    slots: [
      { id: 10, shift_date: "2026-04-10", position: "Projektion", start_time: "18:00", end_time: "22:00" },
      { id: 11, shift_date: "2026-04-10", position: "Projektion", start_time: "18:00", end_time: "22:00", require_leader: true },
    ],
    pauseRules: [],
  });
  assert.equal(result.unfilledSlots.length, 0);
  const byId = new Map(result.plannedShifts.map((shift) => [shift.slot_id, shift.employee_id]));
  assert.equal(byId.get(11), 2);
  assert.equal(byId.get(10), 1);

  const onlyRegular = generateAutoPlanSlots({
    employees: [employees[0]],
    existingShifts: [],
    availability: [],
    slots: [{ shift_date: "2026-04-10", position: "Projektion", start_time: "18:00", end_time: "22:00", require_leader: true }],
    pauseRules: [],
  });
  assert.equal(onlyRegular.plannedShifts.length, 0);
  assert.match(onlyRegular.unfilledSlots[0]?.reason ?? "", /Projektionsleitung/);
});

test("period rules replace the standard rules within the period", () => {
  const rules: ShiftRule[] = [
    rule({ id: 1 }),
    rule({ id: 2, period_id: 7, position: "Projektion", start_time: "10:00", end_time: "14:00", weekdays: [1, 2, 3, 4, 5] }),
  ];
  const periods: RulePeriod[] = [{ id: 7, name: "Ferien", start_date: "2026-04-06", end_date: "2026-04-17" }];

  const inside = slotsForDate("2026-04-08", rules, [], periods);
  assert.equal(inside.period?.name, "Ferien");
  assert.deepEqual(inside.slots.map((slot) => slot.position), ["Projektion"]);

  const outside = slotsForDate("2026-04-22", rules, [], periods);
  assert.equal(outside.period, null);
  assert.deepEqual(outside.slots.map((slot) => slot.position), ["Serviceleitung"]);
});

test("a period without rules does not remove the standard demand", () => {
  const rules = [rule({ id: 1 })];
  const periods: RulePeriod[] = [{ id: 9, name: "Leer", start_date: "2026-04-01", end_date: "2026-04-30" }];
  const result = slotsForDate("2026-04-08", rules, [], periods);
  assert.equal(result.period, null);
  assert.equal(result.slots.length, 1);
});

test("overlapping periods: the later start wins; day overrides beat periods", () => {
  const rules: ShiftRule[] = [
    rule({ id: 1, period_id: 1, position: "Serviceleitung" }),
    rule({ id: 2, period_id: 2, position: "Projektion" }),
  ];
  const periods: RulePeriod[] = [
    { id: 1, name: "Lang", start_date: "2026-07-01", end_date: "2026-08-31" },
    { id: 2, name: "Festival", start_date: "2026-07-10", end_date: "2026-07-20" },
  ];
  assert.equal(periodForDate("2026-07-15", periods, rules)?.name, "Festival");
  assert.equal(periodForDate("2026-07-05", periods, rules)?.name, "Lang");

  const overrides: DayRequirement[] = [
    {
      requirement_date: "2026-07-15",
      position: "Serviceleitung",
      require_leader: false,
      start_time: "09:00",
      end_time: "12:00",
      required_count: 1,
      note: null,
    },
  ];
  const day = slotsForDate("2026-07-15", rules, overrides, periods);
  assert.equal(day.period, null);
  assert.equal(day.overridden, true);
  assert.equal(day.slots[0]?.start_time, "09:00");
});
