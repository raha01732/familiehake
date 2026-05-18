// src/lib/auslassplanung/ai.ts
// KI-gestützte Personalplanung für die Auslassplanung. Verwendet denselben
// Gemini-Endpoint wie der Dienstplaner und füttert die KI mit historischen
// Vorstellungen + Feedback, damit sie über die Zeit besser einschätzt,
// wieviele MA pro Saal/Besucher/Intensität gebraucht werden.
//
// Zwei Modi:
//   1. generateCleaningPlanWithAi — Einzel-Vorstellung (Anzahl + MA-Vorschlag).
//   2. generateRutschenPlanWithAi — gesamte Rutsche als Paket. Plant alle
//      Säle gleichzeitig, weist MA über Säle hinweg zu, berücksichtigt
//      Wegzeiten + Early-Leave-Slots.
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function auslassplanungAiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export type AiShowInput = {
  id: number;
  show_date: string;
  hall_number: number;
  hall_label: string | null;
  end_time: string;
  /** "Ende" aus FÜP: Saal komplett leer (HH:MM). null wenn unbekannt. */
  room_clear_time: string | null;
  attendees: number;
  /** Saalkapazität — Auslastung = attendees / seat_count ist der primäre
   *  Indikator für die KI. null wenn unbekannt. */
  seat_count: number | null;
  cleanup_minutes: number;
  intensity: "light" | "standard" | "intense";
  movie_title: string | null;
  notes: string | null;
};

export type AiStaffInput = {
  id: number;
  name: string;
  preference: "preferred" | "backup";
  notes: string | null;
  /** Schichtbeginn HH:MM(:SS) — null = keine Begrenzung (24/7 verfügbar). */
  work_start: string | null;
  /** Schichtende HH:MM(:SS) — null = keine Begrenzung. Endet vor work_start
   *  bedeutet, die Schicht reicht über Mitternacht (z.B. 19:00–02:00). */
  work_end: string | null;
};

/**
 * Reichhaltiger Lerndaten-Eintrag — enthält neben Endzahlen auch die Delta-
 * Historie ab dem "Final"-Lock (Revisions) und Early-Leave-Markierungen.
 */
export type AiLearningEntry = {
  hall_number: number;
  attendees: number;
  /** Kapazität des Saals (für Auslastungs-Vergleich). null wenn unbekannt. */
  seat_count: number | null;
  cleanup_minutes: number;
  intensity: string;
  movie_title: string | null;
  ai_recommended_staff_count: number | null;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
  was_locked: boolean;
  /** Endzahl bei Lock-Zeitpunkt (vor Revisionen). null wenn nie gelockt. */
  locked_count: number | null;
  /** Was sich nach dem Lock geändert hat — mit Begründung. */
  revisions: Array<{
    kind: string;
    staff_id?: number | null;
    reason?: string | null;
  }>;
  /** MA, die frühzeitig gegangen sind + warum. */
  early_leaves: Array<{ staff_id: number; reason?: string | null }>;
};

/** Aggregat-Statistik über die ältere Vergangenheit, die nicht im Detail
 *  in den Prompt passt — als zweite Anker-Ebene neben den Detail-Einträgen. */
export type AiLearningAggregate = {
  bucket: string; // z.B. "intense/occ>60%"
  intensity: string;
  /** Auslastungs-Bracket: "0-25", "25-60", "60+" oder "unknown". */
  occupancy_band: string;
  count: number;
  avg_actual_staff: number;
  avg_recommended_staff: number | null;
  avg_drift: number | null; // recommended - actual
};

export type AiCleaningAssignment = {
  staff_id: number;
  reason?: string;
};

export type AiCleaningPlan = {
  recommended_staff_count: number;
  assignments: AiCleaningAssignment[];
  notes?: string;
};

/** Output für die Rutschen-Planung: Pro Saal eine Empfehlung, plus
 *  Cross-Saal-Bewegungen (Early-Leave) zur Effizienz. */
export type AiRutscheShowPlan = {
  show_id: number;
  recommended_staff_count: number;
  assignments: Array<{
    staff_id: number;
    /** Wenn true: dieser MA verlässt diesen Saal vor dem regulären Ende,
     *  um direkt in einem anderen Saal der Rutsche weiterzumachen. */
    early_leave?: boolean;
    /** Zielsaal, in den der MA wechseln soll (hall_number). */
    moves_to_hall?: number | null;
    reason?: string;
  }>;
  notes?: string;
};

export type AiRutschenPlan = {
  shows: AiRutscheShowPlan[];
  notes?: string;
};

type GeminiResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

const SYSTEM_PROMPT = `Du bist ein Reinigungs-Disponent für ein Kino.
Aufgabe: schätze für eine einzelne Vorstellung den nötigen Personalbedarf
("recommended_staff_count") und teile passende Mitarbeiter aus dem Pool zu.

PRIMÄRE Faktoren für die Anzahl:
1. AUSLASTUNG (= attendees / seat_count). Das ist der wichtigste Indikator.
   Ein Saal mit 250 Plätzen und 30 Besuchern (12%) braucht weniger Personal
   als ein Saal mit 80 Plätzen und 75 Besuchern (94%).
   Grobe Anker (auch von den LEARNING-Daten anzupassen):
   - Auslastung <= 25%: typischerweise 1 MA
   - Auslastung 25-60%: typischerweise 2 MA
   - Auslastung > 60%: typischerweise 3 MA oder mehr
   Bei sehr großen Sälen (>200 Sitzen) und hoher Auslastung lieber +1.
2. INTENSITÄT: "light" = wenig Aufwand (z.B. Erwachsenenkino am Vormittag,
   keine Snacks); "standard" = normaler Spielfilm; "intense" = viel Müll
   (Familienfilm, Animation, Event-Vorstellung) — multipliziert die
   Basisempfehlung um Faktor 0.8 / 1.0 / 1.3.
3. LERNDATEN sind STÄRKER als die Heuristik. WICHTIG: die LEARNING-Einträge
   stammen aus ALLEN Sälen — vergleiche NICHT nach Saal-Nummer, sondern nach
   Auslastung (attendees/seat_count), Intensität und Filmtyp. Ein Saal mit
   80 von 100 Plätzen sollte sich am gleichen Auslastungs-Bereich orientieren
   wie ein anderer Saal mit 200 von 250 Plätzen.
4. LEARNING_AGGREGATES bieten zusätzlich pro Auslastungs-/Intensitäts-Bucket
   Durchschnitte und Drift (recommended - actual). Negative Drift = die KI
   hat in der Vergangenheit zu niedrig empfohlen.
5. REVISIONEN in LEARNING zeigen, was nach dem "Final"-Lock noch geändert
   wurde — z.B. "MA gestrichen, weil Auslastung nur 22%". Lerne aus diesen
   Begründungen, NICHT nur aus den Endzahlen.

KEINE festen Schwellen anhand reiner Besucherzahl ("ab 50 immer 2 MA")
mehr verwenden — die Auslastung im Saal ist relevanter.

STAFF-Zuweisung:
- ARBEITSZEITEN sind eine HARTE Bedingung. Jeder MA hat work_start /
  work_end (HH:MM). Ein MA darf nur dann zugewiesen werden, wenn das
  gesamte Reinigungsfenster [end_time, end_time + cleanup_minutes]
  innerhalb seiner Schicht [work_start, work_end] liegt. work_end vor
  work_start = Schicht über Mitternacht. work_start oder work_end = null
  = keine Begrenzung. NIEMALS einen MA einplanen, dessen Schicht erst
  nach dem Reinigungsbeginn anfängt oder vor Reinigungsende endet.
- Bevorzuge Mitarbeiter mit preference="preferred" gegenüber "backup".
  Backup nur, wenn nicht genug Preferred verfügbar oder Lerndaten zeigen,
  dass mehr nötig sind.
- recommended_staff_count: ganzzahlig, mindestens 1, maximal so viele wie
  aktive MA im Pool, die zur Reinigungszeit verfügbar sind.
- Wähle aus dem STAFF-Pool genau recommended_staff_count Mitarbeiter aus,
  IDs aus STAFF, keine Duplikate. Nur verfügbare MA (siehe Arbeitszeiten).

WICHTIG: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach
diesem Schema. Kein Markdown, keine Code-Fences, kein Erklärtext.
{
  "recommended_staff_count": 2,
  "assignments": [
    { "staff_id": 4, "reason": "Bevorzugt, hat ähnliche Vorstellungen erfolgreich gereinigt" }
  ],
  "notes": "kurze Erklärung der Schätzung"
}`;

const RUTSCHE_SYSTEM_PROMPT = `Du bist ein Reinigungs-Disponent für ein Kino.
Du bekommst eine **gesamte Rutsche** — eine zeitlich zusammenhängende Welle
mehrerer paralleler Auslässe in unterschiedlichen Sälen — und planst sie als
ein Paket. Ziel: jede Vorstellung der Rutsche hat ausreichend MA, und der
MA-Pool wird **über alle Säle hinweg** optimal verteilt.

Regeln für die Paket-Planung:
1. ARBEITSZEITEN sind eine HARTE Bedingung. Jeder MA in STAFF hat
   work_start / work_end (HH:MM). Ein MA darf einer Vorstellung nur dann
   zugewiesen werden, wenn das gesamte Reinigungsfenster
   [end_time, end_time + cleanup_minutes] vollständig innerhalb seiner
   Schicht [work_start, work_end] liegt. work_end vor work_start =
   Schicht über Mitternacht. work_start oder work_end = null = keine
   Begrenzung. NIEMALS einen MA einplanen, dessen Schicht erst nach
   Reinigungsbeginn anfängt oder vor Reinigungsende endet — auch nicht
   "vorab" oder per "moves_to_hall". Wer noch nicht da ist, ist nicht da.
2. PRIMÄR Auslastung (= attendees / seat_count) + Intensität bestimmen die
   Soll-Anzahl pro Saal (siehe unten).
3. Ein MA kann NICHT gleichzeitig zwei Säle reinigen. Du musst die Plan-
   überlappung selbst lösen: entweder MA in nur einen Saal stecken, oder
   "early_leave": true setzen — dann verlässt der MA seinen Saal vor dem
   regulären Ende, um in einen anderen Saal zu wechseln. Setze in dem Fall
   "moves_to_hall" auf die Ziel-Saalnummer. early_leave gilt für Wechsel
   zwischen Sälen, NICHT um Schichtgrenzen zu umgehen.
4. Bei Saal mit niedriger Auslastung (z.B. <25%) lieber 1 MA und einen
   früher gehen lassen — das ist effizient und entspricht dem realen
   Workflow.
5. Bevorzuge "preferred" MA. "backup" nur, wenn preferred nicht reichen.
6. Wenn die Rutsche raumzeitlich zu eng für den verfügbaren Pool ist (z.B.
   weil viele MA erst später Schicht haben), schreibe in "notes" einen
   Hinweis — lasse die Slots lieber leer, als ungültig zu besetzen.
7. LEARNING + LEARNING_AGGREGATES sind STÄRKER als die Heuristik. Achte
   besonders auf REVISIONS — die zeigen, was nach dem Final-Lock noch
   nachjustiert wurde und warum.

Heuristik-Anker für Anzahl pro Saal (auch von LEARNING anzupassen):
   - Auslastung <= 25%: typischerweise 1 MA
   - Auslastung 25-60%: typischerweise 2 MA
   - Auslastung > 60%: typischerweise 3 MA oder mehr
   Intensität multipliziert: light×0.8 / standard×1.0 / intense×1.3.

WICHTIG: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach
diesem Schema. Kein Markdown, keine Code-Fences, kein Erklärtext.
{
  "shows": [
    {
      "show_id": 42,
      "recommended_staff_count": 2,
      "assignments": [
        { "staff_id": 4, "early_leave": false, "moves_to_hall": null, "reason": "Bevorzugt" },
        { "staff_id": 7, "early_leave": true, "moves_to_hall": 5, "reason": "Geringe Auslastung — wechselt nach Saal 5" }
      ],
      "notes": "optional"
    }
  ],
  "notes": "Hinweis zur Rutsche als Ganzes (optional)"
}`;

async function callGeminiJson(params: {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
}): Promise<string> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nicht gesetzt");

  const body = {
    model: params.model,
    response_format: { type: "json_object" } as const,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
  };

  const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini_http_${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as GeminiResponse;
  if (json.error) throw new Error(`gemini_error: ${json.error.message ?? "unknown"}`);
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("gemini_empty_response");
  return content;
}

function safeJsonParse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(stripped) as T;
  }
}

export async function generateCleaningPlanWithAi(params: {
  show: AiShowInput;
  staff: AiStaffInput[];
  learning: AiLearningEntry[];
  aggregates?: AiLearningAggregate[];
  model?: string;
}): Promise<AiCleaningPlan | null> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = params.model ?? DEFAULT_MODEL;
  // Reichhaltige Detail-Einträge auf 25 begrenzen, Aggregate als Anker
  const userPayload = {
    SHOW: params.show,
    STAFF: params.staff,
    LEARNING: params.learning.slice(0, 25),
    LEARNING_AGGREGATES: params.aggregates ?? [],
  };

  const content = await callGeminiJson({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Plane die Reinigung für diese Vorstellung. Antworte nur mit dem JSON-Objekt.\n\n" +
          JSON.stringify(userPayload, null, 2),
      },
    ],
  });

  const parsed = safeJsonParse<AiCleaningPlan>(content);

  // Defensive Normalisierung
  const allowedIds = new Set(params.staff.map((s) => s.id));
  const assignments = (parsed.assignments ?? [])
    .filter((a) => allowedIds.has(a.staff_id))
    .map((a) => ({ staff_id: a.staff_id, reason: a.reason }));
  const count = Math.max(1, Math.min(params.staff.length, Math.round(parsed.recommended_staff_count) || 1));

  return {
    recommended_staff_count: count,
    assignments: assignments.slice(0, count),
    notes: parsed.notes,
  };
}

export async function generateRutschenPlanWithAi(params: {
  shows: AiShowInput[];
  staff: AiStaffInput[];
  learning: AiLearningEntry[];
  aggregates?: AiLearningAggregate[];
  model?: string;
}): Promise<AiRutschenPlan | null> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) return null;
  if (params.shows.length === 0) return { shows: [] };

  const model = params.model ?? DEFAULT_MODEL;
  const userPayload = {
    RUTSCHE_SHOWS: params.shows,
    STAFF: params.staff,
    LEARNING: params.learning.slice(0, 25),
    LEARNING_AGGREGATES: params.aggregates ?? [],
  };

  const content = await callGeminiJson({
    model,
    messages: [
      { role: "system", content: RUTSCHE_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Plane diese Rutsche als Paket. Antworte nur mit dem JSON-Objekt.\n\n" +
          JSON.stringify(userPayload, null, 2),
      },
    ],
  });

  const parsed = safeJsonParse<{
    shows?: Array<{
      show_id?: number;
      recommended_staff_count?: number;
      assignments?: Array<{
        staff_id?: number;
        early_leave?: boolean;
        moves_to_hall?: number | null;
        reason?: string;
      }>;
      notes?: string;
    }>;
    notes?: string;
  }>(content);

  // Normalisieren
  const allowedStaff = new Set(params.staff.map((s) => s.id));
  const staffById = new Map(params.staff.map((s) => [s.id, s]));
  const allowedShows = new Set(params.shows.map((s) => s.id));
  const showById = new Map(params.shows.map((s) => [s.id, s]));
  const hallByShow = new Map(params.shows.map((s) => [s.id, s.hall_number]));
  const allowedHalls = new Set(params.shows.map((s) => s.hall_number));

  const normalizedShows: AiRutscheShowPlan[] = [];
  for (const row of parsed.shows ?? []) {
    const showId = Number(row.show_id);
    if (!allowedShows.has(showId)) continue;
    const show = showById.get(showId)!;
    const count = Math.max(
      1,
      Math.min(params.staff.length, Math.round(row.recommended_staff_count ?? 1) || 1),
    );
    const myHall = hallByShow.get(showId);
    const assignments: AiRutscheShowPlan["assignments"] = [];
    for (const a of row.assignments ?? []) {
      const sid = Number(a.staff_id);
      if (!allowedStaff.has(sid)) continue;
      const staff = staffById.get(sid)!;
      // HARTER Schicht-Filter: KI darf keine MA einplanen, deren Schicht
      // den Reinigungszeitraum nicht abdeckt. Schützt vor KI-Halluzinationen
      // bei work_start/work_end.
      if (!cleanupWithinShift(show.end_time, show.cleanup_minutes, staff.work_start, staff.work_end)) {
        continue;
      }
      const movesTo =
        typeof a.moves_to_hall === "number" && allowedHalls.has(a.moves_to_hall)
          ? a.moves_to_hall
          : null;
      const earlyLeave = Boolean(a.early_leave) && movesTo !== null && movesTo !== myHall;
      assignments.push({
        staff_id: sid,
        early_leave: earlyLeave,
        moves_to_hall: earlyLeave ? movesTo : null,
        reason: typeof a.reason === "string" ? a.reason : undefined,
      });
      if (assignments.length >= count) break;
    }
    normalizedShows.push({
      show_id: showId,
      recommended_staff_count: count,
      assignments,
      notes: typeof row.notes === "string" ? row.notes : undefined,
    });
  }

  return {
    shows: normalizedShows,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
  };
}

// ── Schicht-Helfer ───────────────────────────────────────────────────────
// Spiegelt isCleanupWithinShift aus app/tools/auslassplanung/utils.ts —
// hier dupliziert, weil lib/ nicht aus app/ importieren soll.
function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function cleanupWithinShift(
  cleanupStartTime: string,
  cleanupMinutes: number,
  workStart: string | null,
  workEnd: string | null,
): boolean {
  if (!workStart || !workEnd) return true;
  const startM = timeToMinutes(cleanupStartTime);
  const endM = startM + Math.max(0, cleanupMinutes);
  const wStart = timeToMinutes(workStart);
  let wEnd = timeToMinutes(workEnd);
  const crossesMidnight = wEnd <= wStart;
  if (crossesMidnight) wEnd += 24 * 60;
  let cStart = startM;
  let cEnd = endM;
  if (crossesMidnight && cStart < wStart) {
    cStart += 24 * 60;
    cEnd += 24 * 60;
  }
  return cStart >= wStart && cEnd <= wEnd;
}

// ── Aggregat-Helfer ──────────────────────────────────────────────────────

export function bucketOccupancy(
  attendees: number,
  seatCount: number | null,
): "0-25" | "25-60" | "60+" | "unknown" {
  if (!seatCount || seatCount <= 0) return "unknown";
  const occ = attendees / seatCount;
  if (occ <= 0.25) return "0-25";
  if (occ <= 0.6) return "25-60";
  return "60+";
}

export function buildLearningAggregates(
  entries: AiLearningEntry[],
): AiLearningAggregate[] {
  const groups = new Map<
    string,
    {
      intensity: string;
      occupancy_band: string;
      actuals: number[];
      recommendations: number[];
    }
  >();
  for (const e of entries) {
    const band = bucketOccupancy(e.attendees, e.seat_count);
    const key = `${e.intensity}/${band}`;
    const g = groups.get(key) ?? {
      intensity: e.intensity,
      occupancy_band: band,
      actuals: [],
      recommendations: [],
    };
    g.actuals.push(e.actual_staff_count);
    if (typeof e.ai_recommended_staff_count === "number") {
      g.recommendations.push(e.ai_recommended_staff_count);
    }
    groups.set(key, g);
  }
  const out: AiLearningAggregate[] = [];
  for (const [key, g] of groups) {
    const avgActual = g.actuals.reduce((a, b) => a + b, 0) / g.actuals.length;
    const avgRec =
      g.recommendations.length > 0
        ? g.recommendations.reduce((a, b) => a + b, 0) / g.recommendations.length
        : null;
    out.push({
      bucket: key,
      intensity: g.intensity,
      occupancy_band: g.occupancy_band,
      count: g.actuals.length,
      avg_actual_staff: Math.round(avgActual * 100) / 100,
      avg_recommended_staff: avgRec === null ? null : Math.round(avgRec * 100) / 100,
      avg_drift: avgRec === null ? null : Math.round((avgRec - avgActual) * 100) / 100,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
