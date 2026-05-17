// src/lib/auslassplanung/ai.ts
// KI-gestützte Personalplanung für die Auslassplanung. Verwendet denselben
// Gemini-Endpoint wie der Dienstplaner und füttert die KI mit historischen
// Vorstellungen + Feedback, damit sie über die Zeit besser einschätzt,
// wieviele MA pro Saal/Besucher/Intensität gebraucht werden.
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
  attendees: number;
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
};

export type AiLearningEntry = {
  hall_number: number;
  attendees: number;
  cleanup_minutes: number;
  intensity: string;
  movie_title: string | null;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
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

type GeminiResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

const SYSTEM_PROMPT = `Du bist ein Reinigungs-Disponent für ein Kino.
Aufgabe: schätze für eine einzelne Vorstellung (Saal, Endzeit, Besucher,
Intensität) die nötige Anzahl Reinigungs-Mitarbeiter und teile passende
Mitarbeiter aus dem gegebenen Pool zu.

Regeln:
- "intensity": "light" = kurze schnelle Reinigung, weniger Personal;
  "standard" = normale Vorstellung; "intense" = mehr Müll/Aufwand,
  z.B. Familienfilme oder 3D-Vorführungen — mehr Personal nötig.
- Bevorzuge Mitarbeiter mit preference="preferred" gegenüber "backup".
  Mitarbeiter mit preference="backup" nur einplanen, wenn nicht genug
  "preferred"-MA verfügbar oder Lerndaten zeigen, dass mehr nötig sind.
- Wenn LEARNING-Daten vorhanden sind, nutze sie um deine Schätzung an
  bisherigen tatsächlichen Werten zu kalibrieren — vergleichbare Säle,
  ähnliche Besucherzahlen und Intensität sind ein guter Anker.
- recommended_staff_count: ganzzahlig, mindestens 1, maximal so viele
  wie aktive MA im Pool.
- Wähle aus dem STAFF-Pool genau recommended_staff_count Mitarbeiter
  aus, IDs aus STAFF, keine Duplikate.

WICHTIG: Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach
diesem Schema. Kein Markdown, keine Code-Fences, kein Erklärtext.
{
  "recommended_staff_count": 2,
  "assignments": [
    { "staff_id": 4, "reason": "Bevorzugt, hat ähnliche Vorstellungen erfolgreich gereinigt" }
  ],
  "notes": "kurze Erklärung der Schätzung"
}`;

export async function generateCleaningPlanWithAi(params: {
  show: AiShowInput;
  staff: AiStaffInput[];
  learning: AiLearningEntry[];
  model?: string;
}): Promise<AiCleaningPlan | null> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = params.model ?? DEFAULT_MODEL;

  const userPayload = {
    SHOW: params.show,
    STAFF: params.staff,
    LEARNING: params.learning.slice(0, 100),
  };

  const body = {
    model,
    response_format: { type: "json_object" } as const,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Plane die Reinigung für diese Vorstellung. Antworte nur mit dem JSON-Objekt.\n\n" +
          JSON.stringify(userPayload, null, 2),
      },
    ],
    temperature: 0.2,
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

  let parsed: AiCleaningPlan;
  try {
    parsed = JSON.parse(content) as AiCleaningPlan;
  } catch {
    // Manchmal kommt der Response in Code-Fences trotz Prompt — versuche zu strippen.
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(stripped) as AiCleaningPlan;
  }

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
