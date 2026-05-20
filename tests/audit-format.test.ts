// tests/audit-format.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  describeAuditEvent,
  summarizeAuditEvents,
  auditActionLabel,
  type AuditRow,
  type AuditNameLookups,
} from "@/lib/audit-format";

const lookups: AuditNameLookups = {
  employees: new Map([
    [1, "Anna"],
    [2, "Max"],
  ]),
  staff: new Map([[5, "Lena"]]),
  shows: new Map([[9, "Vorstellung #9"]]),
};

function row(action: string, detail: Record<string, unknown> | null, extra: Partial<AuditRow> = {}): AuditRow {
  return {
    ts: "2026-05-20T12:30:00Z",
    action,
    actor_email: extra.actor_email ?? "admin@example.com",
    target: extra.target ?? null,
    detail,
  };
}

test("describeAuditEvent: Schicht gespeichert mit Mitarbeitername und Zeitspanne", () => {
  const text = describeAuditEvent(
    row("dienstplan_shift_save", {
      employeeId: 1,
      date: "2026-05-21",
      start: "08:00:00",
      end: "14:00",
      mode: "update",
    }),
    lookups
  );
  assert.equal(text, "Schicht für Anna am 21.05.2026 (08:00–14:00) geändert");
});

test("describeAuditEvent: Schicht verschoben nutzt beide Mitarbeiternamen", () => {
  const text = describeAuditEvent(
    row("dienstplan_shift_move", { fromEmployeeId: 2, toEmployeeId: 1, date: "2026-05-21" }),
    lookups
  );
  assert.equal(text, "Schicht am 21.05.2026 von Max zu Anna verschoben");
});

test("describeAuditEvent: unbekannte ID fällt auf Platzhalter zurück", () => {
  const text = describeAuditEvent(row("dienstplan_employee_delete", { employeeId: 99 }), lookups);
  assert.equal(text, "Mitarbeiter Mitarbeiter #99 gelöscht");
});

test("describeAuditEvent: Vorstellung angelegt baut Label aus detail", () => {
  const text = describeAuditEvent(
    row("auslass_show_create", { date: "2026-05-22", hallNumber: 3, movieTitle: "Dune" }),
    lookups
  );
  assert.equal(text, 'Vorstellung „Dune“ (Saal 3, 22.05.2026) angelegt');
});

test("describeAuditEvent: Zuweisung entfernt nutzt Personal- und Show-Lookup", () => {
  const text = describeAuditEvent(row("auslass_assignment_remove", { showId: 9, staffId: 5 }), lookups);
  assert.equal(text, "Zuweisung von Lena bei Vorstellung #9 entfernt");
});

test("describeAuditEvent: bestehende Action ohne Spezialfall nutzt Label + target", () => {
  const text = describeAuditEvent(row("file_upload", null, { target: "urlaub.pdf" }), lookups);
  assert.equal(text, "Datei hochgeladen – urlaub.pdf");
});

test("describeAuditEvent: völlig unbekannte Action wird prettified", () => {
  const text = describeAuditEvent(row("some_new_thing", null), lookups);
  assert.equal(text, "Some new thing");
});

test("summarizeAuditEvents zählt pro Label, absteigend sortiert", () => {
  const events = [
    row("dienstplan_shift_save", { employeeId: 1 }),
    row("dienstplan_shift_save", { employeeId: 2 }),
    row("auslass_show_plan", { showId: 9 }),
  ];
  const summary = summarizeAuditEvents(events);
  assert.deepEqual(summary, [
    { label: "Schicht gespeichert", count: 2 },
    { label: "Vorstellung geplant", count: 1 },
  ]);
});

test("auditActionLabel liefert deutsches Label bzw. Fallback", () => {
  assert.equal(auditActionLabel("auslass_rutsche_plan"), "Rutsche geplant");
  assert.equal(auditActionLabel("unbekannt_xyz"), "Unbekannt xyz");
});
