// src/lib/dienstplaner/ai.ts
// KI-gestützte Schichtbesetzung über Google Gemini (OpenAI-kompatibler Endpoint).
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function dienstplanAiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export type AiSlotInput = {
  id: number;
  date: string;
  weekday: number;
  position: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
};

export type AiEmployeeInput = {
  id: number;
  name: string;
  position: string | null;
  position_category: string | null;
  monthly_target_hours: number;
  weekly_target_hours: number;
  current_month_hours: number;
};

export type AiAvailabilityInput = {
  employee_id: number;
  date: string;
  status: string | null;
  fixed_start: string | null;
  fixed_end: string | null;
};

export type AiAssignment = {
  slot_id: number;
  employee_id: number;
  reason?: string;
};

export type AiAssignmentResponse = {
  assignments: AiAssignment[];
  notes?: string;
};

const SYSTEM_PROMPT = `Du bist ein Dienstplan-Assistent für ein Kino in Deutschland.
Aufgabe: ordne unbesetzte Schichten ("Slots") fairen Mitarbeitenden zu, sodass:
- jeder seine Soll-Stunden möglichst erreicht (current_month_hours + neue Schichten ≈ monthly_target_hours),
- niemand mehr als seine Wochen-Sollstunden +20% in einer ISO-Woche bekommt,
- niemand zwei Schichten am gleichen Tag bekommt,
- Verfügbarkeitsstatus respektiert wird:
    * status "F" (Frei), "U" (Urlaub) oder "K" (Krank) → Mitarbeiter NICHT einsetzen
    * status "fix" → nur einsetzen wenn fixed_start ≤ slot.start_time und fixed_end ≥ slot.end_time
    * status "fr" (Frühdienst bevorzugt) → nicht in Spätdiensten ab 15:00 Uhr,
    * status "sp" (Spätdienst bevorzugt) → nicht in Frühdiensten vor 13:00 Uhr,
- Position passend ist: wenn slot.position gesetzt ist, soll die employee.position_category passen
    (slot "serviceleitung" → category "serviceleitung", slot "projektion" → "projektion" oder "projektionsleitung").
- Nicht alle Slots MÜSSEN besetzt werden — wenn keine faire Zuweisung möglich ist, lieber leer lassen.

WICHTIG: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach folgendem Schema. Kein Markdown, keine Code-Fences, kein Erklärtext davor oder danach. Antwortbeispiel ist KOMPLETT JSON:
{
  "assignments": [
    { "slot_id": 12, "employee_id": 4, "reason": "Soll noch 18h bis Soll" }
  ],
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
  // 1) Direkter Versuch
  try {
    return JSON.parse(trimmed);
  } catch {
    // weitermachen
  }

  // 2) Code-Fences entfernen
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // weitermachen
    }
  }

  // 3) Erstes balanciertes Top-Level-{…}-Objekt extrahieren
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
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function askAiToAssignSlots(input: {
  month: string;
  slots: AiSlotInput[];
  employees: AiEmployeeInput[];
  availability: AiAvailabilityInput[];
}): Promise<AiAssignmentResponse> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ist nicht konfiguriert");

  const model = env().GEMINI_MODEL || DEFAULT_MODEL;

  const userMessage = JSON.stringify(
    {
      month: input.month,
      slots: input.slots,
      employees: input.employees,
      availability: input.availability,
    },
    null,
    2
  );

  // reasoning_effort: "low" begrenzt Gemini 2.5 Thinking, damit das
  // max_tokens-Budget für den finalen JSON-Output reicht.
  // response_format erzwingt sauberes JSON; parseLooseJson() bleibt als
  // Fallback, falls Modelle trotzdem Text drumherum erzeugen.
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
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as GeminiResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    const finishReason = json.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(
      `Gemini hat keine Antwort geliefert (finish_reason=${finishReason}). ` +
        `Mögliche Ursache: Token-Limit durch Thinking erschöpft.`
    );
  }
  const parsed = parseLooseJson(content);
  if (!parsed) {
    throw new Error(
      `Gemini hat kein verwertbares JSON geliefert. Antwort-Snippet: ${content.slice(0, 200)}`
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini hat unerwartete Struktur geliefert");
  }
  const obj = parsed as Record<string, unknown>;
  const assignmentsRaw = Array.isArray(obj.assignments) ? obj.assignments : [];
  const assignments: AiAssignment[] = [];
  for (const entry of assignmentsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const slotId = Number(row.slot_id);
    const employeeId = Number(row.employee_id);
    if (!Number.isFinite(slotId) || !Number.isFinite(employeeId)) continue;
    const reason = typeof row.reason === "string" ? row.reason.slice(0, 200) : undefined;
    assignments.push({ slot_id: slotId, employee_id: employeeId, reason });
  }
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 500) : undefined;
  return { assignments, notes };
}
