// tests/auslassplanung-ai.test.ts
// Regressions-Tests für den Schicht-Filter in der Rutschen-KI-Normalisierung.
// Hintergrund: Die KI hat MA mit Schichtbeginn 19:00 in Auslässe um 13:49
// eingeplant, weil work_start/work_end nicht im Prompt landeten. Der Fix
// schickt die Schichtzeiten jetzt mit UND normalisiert die KI-Antwort
// gegen einen harten Schicht-Filter. Diese Tests fixieren genau dieses
// Verhalten — KI-Output wird simuliert, kein Gemini-Call.
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRutschenAiResponse,
  type AiShowInput,
  type AiStaffInput,
  type RawRutschenAiResponse,
} from "../src/lib/auslassplanung/ai";

function show(overrides: Partial<AiShowInput> = {}): AiShowInput {
  return {
    id: 1,
    show_date: "2026-05-18",
    hall_number: 5,
    hall_label: null,
    end_time: "13:49",
    room_clear_time: null,
    attendees: 40,
    seat_count: 100,
    cleanup_minutes: 15,
    intensity: "standard",
    movie_title: null,
    notes: null,
    ...overrides,
  };
}

function staff(overrides: Partial<AiStaffInput> = {}): AiStaffInput {
  return {
    id: 100,
    name: "MA",
    preference: "preferred",
    notes: null,
    work_start: null,
    work_end: null,
    ...overrides,
  };
}

test("normalize dropt MA, deren Schicht erst nach Reinigungsbeginn anfängt", () => {
  const s1 = show({ id: 1, end_time: "13:49", cleanup_minutes: 15 });
  const lateShift = staff({ id: 100, work_start: "19:00", work_end: "23:00" });
  const aiRaw: RawRutschenAiResponse = {
    shows: [
      {
        show_id: 1,
        recommended_staff_count: 1,
        assignments: [{ staff_id: 100, reason: "KI-Halluzination" }],
      },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [s1], [lateShift]);
  assert.equal(out.shows.length, 1);
  assert.deepEqual(out.shows[0].assignments, [], "Spät-Schicht-MA muss raus");
});

test("normalize behält MA, deren Schicht das Reinigungsfenster komplett deckt", () => {
  const s1 = show({ id: 1, end_time: "13:49", cleanup_minutes: 15 });
  const cover = staff({ id: 100, work_start: "12:00", work_end: "18:00" });
  const aiRaw: RawRutschenAiResponse = {
    shows: [
      { show_id: 1, recommended_staff_count: 1, assignments: [{ staff_id: 100 }] },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [s1], [cover]);
  assert.equal(out.shows[0].assignments.length, 1);
  assert.equal(out.shows[0].assignments[0].staff_id, 100);
});

test("normalize behält MA mit Schicht über Mitternacht (19:00–02:00) für Spät-Show 23:30", () => {
  const lateShow = show({ id: 2, end_time: "23:30", cleanup_minutes: 20 });
  const nightShift = staff({ id: 101, work_start: "19:00", work_end: "02:00" });
  const aiRaw: RawRutschenAiResponse = {
    shows: [
      { show_id: 2, recommended_staff_count: 1, assignments: [{ staff_id: 101 }] },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [lateShow], [nightShift]);
  assert.equal(out.shows[0].assignments.length, 1, "Schicht über Mitternacht muss zählen");
});

test("normalize dropt MA mit Mitternachts-Schicht, wenn Reinigung nach Schichtende liegt (02:30 vs 02:00)", () => {
  const tooLateShow = show({ id: 3, end_time: "01:50", cleanup_minutes: 15 }); // endet 02:05
  const nightShift = staff({ id: 102, work_start: "19:00", work_end: "02:00" });
  const aiRaw: RawRutschenAiResponse = {
    shows: [
      { show_id: 3, recommended_staff_count: 1, assignments: [{ staff_id: 102 }] },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [tooLateShow], [nightShift]);
  assert.deepEqual(out.shows[0].assignments, [], "Reinigung über Schichtende hinaus → raus");
});

test("normalize behält MA mit null-Schicht (keine Begrenzung)", () => {
  const s1 = show({ id: 1, end_time: "13:49", cleanup_minutes: 15 });
  const always = staff({ id: 103, work_start: null, work_end: null });
  const aiRaw: RawRutschenAiResponse = {
    shows: [
      { show_id: 1, recommended_staff_count: 1, assignments: [{ staff_id: 103 }] },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [s1], [always]);
  assert.equal(out.shows[0].assignments.length, 1);
});

test("normalize: gemischter Pool — nur verfügbare MA werden zugewiesen, zählt korrekt", () => {
  const s1 = show({ id: 1, end_time: "13:49", cleanup_minutes: 15 });
  const available = staff({ id: 200, name: "Anna", work_start: "12:00", work_end: "18:00" });
  const lateA = staff({ id: 201, name: "Ben", work_start: "19:00", work_end: "23:00" });
  const lateB = staff({ id: 202, name: "Cara", work_start: "20:00", work_end: "23:59" });

  const aiRaw: RawRutschenAiResponse = {
    shows: [
      {
        show_id: 1,
        recommended_staff_count: 3,
        assignments: [
          { staff_id: 201 }, // muss raus
          { staff_id: 200 }, // bleibt
          { staff_id: 202 }, // muss raus
        ],
      },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [s1], [available, lateA, lateB]);
  const ids = out.shows[0].assignments.map((a) => a.staff_id);
  assert.deepEqual(ids, [200], "nur die in-Schicht-MA überlebt den Filter");
  // recommended_staff_count bleibt 3 — der Aufrufer (planRutscheAction)
  // füllt den Rest per Heuristik-Backfill auf.
  assert.equal(out.shows[0].recommended_staff_count, 3);
});

test("normalize dropt unbekannte Show-IDs und Staff-IDs", () => {
  const s1 = show({ id: 1 });
  const s = staff({ id: 100, work_start: null, work_end: null });

  const aiRaw: RawRutschenAiResponse = {
    shows: [
      { show_id: 999, recommended_staff_count: 1, assignments: [{ staff_id: 100 }] },
      { show_id: 1, recommended_staff_count: 1, assignments: [{ staff_id: 9999 }, { staff_id: 100 }] },
    ],
  };

  const out = normalizeRutschenAiResponse(aiRaw, [s1], [s]);
  assert.equal(out.shows.length, 1, "Show 999 unbekannt → raus");
  assert.equal(out.shows[0].show_id, 1);
  assert.deepEqual(
    out.shows[0].assignments.map((a) => a.staff_id),
    [100],
    "Staff 9999 unbekannt → raus, 100 bleibt",
  );
});
