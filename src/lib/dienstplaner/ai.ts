// src/lib/dienstplaner/ai.ts
// KI-gestützte Schichtbesetzung über Vercel AI Gateway.
// Nutzt standardmäßig ein Gemini-Modell (großzügiger Free-Tier).
import { env } from "@/lib/env";

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export function dienstplanAiEnabled(): boolean {
  return Boolean(env().AI_GATEWAY_API_KEY);
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
    * status "F" oder "K" → Mitarbeiter NICHT einsetzen
    * status "fix" → nur einsetzen wenn fixed_start ≤ slot.start_time und fixed_end ≥ slot.end_time
    * status "fr" (Frühdienst bevorzugt) → nicht in Spätdiensten ab 15:00 Uhr,
    * status "sp" (Spätdienst bevorzugt) → nicht in Frühdiensten vor 13:00 Uhr,
- Position passend ist: wenn slot.position gesetzt ist, soll die employee.position_category passen
    (slot "serviceleitung" → category "serviceleitung", slot "projektion" → "projektion" oder "projektionsleitung").
- Nicht alle Slots MÜSSEN besetzt werden — wenn keine faire Zuweisung möglich ist, lieber leer lassen.

Antworte ausschließlich mit JSON nach folgendem Schema (kein Markdown, kein Erklärtext drumherum):
{
  "assignments": [
    { "slot_id": <number>, "employee_id": <number>, "reason": "<kurz, max 80 Zeichen>" }
  ],
  "notes": "<optional kurze Gesamteinschätzung>"
}`;

type GatewayResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function askAiToAssignSlots(input: {
  month: string;
  slots: AiSlotInput[];
  employees: AiEmployeeInput[];
  availability: AiAvailabilityInput[];
}): Promise<AiAssignmentResponse> {
  const key = env().AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY ist nicht konfiguriert");

  const model = env().AI_GATEWAY_MODEL || DEFAULT_MODEL;

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

  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
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
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as GatewayResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI Gateway hat keine Antwort geliefert");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI Gateway hat ungültiges JSON geliefert");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI Gateway hat unerwartete Struktur geliefert");
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
