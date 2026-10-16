// src/lib/dienstplaner/ai.ts
// KI-Prüfung des Dienstplans über Google Gemini (OpenAI-kompatibler Endpoint).
// Die KI plant nicht allein: Sie schlägt Verbesserungen für einen bereits fertigen Plan vor,
// die anschließend regelbasiert geprüft werden (siehe plan-improve.ts).
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 60_000;

export function dienstplanAiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export type AiSlotInput = {
  id: number;
  date: string;
  weekday: number;
  position: string | null;
  /** true: nur Projektionsleitung */
  leader_only: boolean;
  start_time: string;
  end_time: string;
  note: string | null;
};

export type AiEmployeeInput = {
  id: number;
  name: string;
  position: string | null;
  allowed_positions: string[] | null;
  monthly_target_hours: number;
  weekly_target_hours: number;
  /** Stunden inkl. Urlaub und dem aktuellen Planvorschlag */
  planned_month_hours: number;
  /** planned_month_hours − monthly_target_hours */
  delta_hours: number;
};

export type AiAvailabilityInput = {
  employee_id: number;
  date: string;
  status: string | null;
  fixed_start: string | null;
  fixed_end: string | null;
};

export type AiChange = {
  slot_id: number;
  employee_id: number;
  reason?: string;
};

export type AiImproveResponse = {
  changes: AiChange[];
  notes?: string;
};

export type AiImproveInput = {
  month: string;
  round: number;
  /** Aktuelle Planqualität (niedriger = besser) */
  score: number;
  rules: { max_shifts_per_week: number; min_rest_hours: number; max_consecutive_days: number };
  slots: AiSlotInput[];
  employees: AiEmployeeInput[];
  availability: AiAvailabilityInput[];
  /** Aktueller Plan: Slot → Mitarbeiter */
  assignments: { slot_id: number; employee_id: number }[];
  unfilled: { slot_id: number; reason: string }[];
  /** Optionaler, vorformatierter Textblock aus historischen Dienstplänen. */
  history?: string;
};

const SYSTEM_PROMPT = `Du bist ein Dienstplan-Prüfer für ein Kino in Deutschland.
Ein Algorithmus hat bereits einen regelkonformen Plan erstellt. Deine Aufgabe: den Plan prüfen und gezielt verbessern.

Ziele (in dieser Reihenfolge):
1. Unbesetzte Slots ("unfilled") besetzen, falls möglich.
2. Jeder Mitarbeiter soll seine Monats-Sollstunden möglichst genau erreichen: delta_hours nahe 0. Überstunden (delta > 0) sind schlimmer als Minusstunden. Verschiebe Schichten von Personen mit hohem positivem delta zu Personen mit negativem delta.
3. Wenig "Schicht - frei - Schicht"-Muster, stattdessen zusammenhängende Arbeitsblöcke.
4. Früh/Spät-Wünsche beachten (status "fr" = Frühdienst bevorzugt, nicht ab 15:00 Beginn; "sp" = Spätdienst bevorzugt, nicht vor 13:00 Beginn).
5. Wenn "history" vorhanden ist: als Orientierung für realistische Besetzung nutzen.

Harte Regeln (Verstöße werden automatisch verworfen):
- Kein Einsatz bei Status "F", "U", "K"; bei "fix" nur innerhalb von fixed_start bis fixed_end.
- Position: Slot "Serviceleitung" nur mit freigeschalteter "serviceleitung"; Slot "Projektion" mit "projektion" ODER "projektionsleitung"; leader_only=true nur mit "projektionsleitung".
- Maximal eine Schicht pro Mitarbeiter und Tag.
- Wochenlimit, Mindest-Ruhezeit und maximale Arbeitstage in Folge laut "rules".

Gib nur Änderungen an, die den Plan wirklich verbessern (höchstens 25). Eine Änderung weist einem Slot einen anderen Mitarbeiter zu (slot_id, employee_id). Bei einem Tausch zweier Personen nenne beide Slots. Wenn nichts zu verbessern ist, gib eine leere Liste zurück.

WICHTIG: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, kein Markdown, keine Code-Fences, kein Text davor oder danach:
{
  "changes": [ { "slot_id": 12, "employee_id": 4, "reason": "kurz auf Deutsch" } ],
  "notes": "kurze Gesamteinschätzung"
}`;

type GeminiResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

// Findet das erste vollständige Top-Level-JSON-Objekt in einem String. Robust
// gegen umgebenden Erklärtext und Markdown-Code-Fences (```json … ```).
function parseLooseJson(input: string): unknown {
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // weitermachen
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // weitermachen
    }
  }

  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function askAiToImprovePlan(input: AiImproveInput): Promise<AiImproveResponse> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ist nicht konfiguriert");

  const model = env().GEMINI_MODEL || DEFAULT_MODEL;

  const { history, ...payload } = input;
  const historyBlock = history?.trim() ? `\n\n${history.trim()}` : "";
  const userMessage = JSON.stringify(payload) + historyBlock;

  // reasoning_effort "low" begrenzt Gemini 2.5 Thinking, damit das max_tokens-Budget für das JSON reicht.
  const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as GeminiResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    const finishReason = json.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(`Gemini hat keine Antwort geliefert (finish_reason=${finishReason}).`);
  }
  const parsed = parseLooseJson(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Gemini hat kein verwertbares JSON geliefert. Antwort-Snippet: ${content.slice(0, 200)}`);
  }
  const obj = parsed as Record<string, unknown>;
  const rawChanges = Array.isArray(obj.changes) ? obj.changes : Array.isArray(obj.assignments) ? obj.assignments : [];
  const changes: AiChange[] = [];
  for (const entry of rawChanges) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const slotId = Number(row.slot_id);
    const employeeId = Number(row.employee_id);
    if (!Number.isFinite(slotId) || !Number.isFinite(employeeId)) continue;
    changes.push({
      slot_id: slotId,
      employee_id: employeeId,
      reason: typeof row.reason === "string" ? row.reason.slice(0, 200) : undefined,
    });
  }
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 500) : undefined;
  return { changes: changes.slice(0, 50), notes };
}
