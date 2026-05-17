// src/lib/auslassplanung/attendees-ai.ts
// KI-Schätzung der Besucherzahlen für eine Rutsche. Nutzt Lerndaten aus
// vergangenen Vorstellungen (Saal, Tageszeit, Filmgenre/-titel, Intensität)
// als Anker und liefert plausible Werte, die der Nutzer noch anpassen kann.
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export type AttendeesShowInput = {
  id: number;
  hall_number: number;
  end_time: string;
  cleanup_minutes: number;
  intensity: "light" | "standard" | "intense";
  movie_title: string | null;
};

export type AttendeesLearningEntry = {
  hall_number: number;
  end_time: string;
  intensity: string;
  movie_title: string | null;
  attendees: number;
};

export type AttendeesEstimate = {
  show_id: number;
  attendees: number;
  reason?: string;
};

export type AttendeesEstimateResult = {
  estimates: AttendeesEstimate[];
  notes?: string;
};

export function attendeesAiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

const SYSTEM_PROMPT = `Du bist ein erfahrener Kino-Disponent und schätzt für eine Gruppe
von Vorstellungen ("Rutsche") die plausible Besucherzahl pro Saal. Du erhältst:

- SHOWS: die Vorstellungen der aktuellen Rutsche (Saal, Endzeit, Filmtitel, Intensität).
- LEARNING: bis zu 100 vergangene Vorstellungen mit tatsächlich gezählten Besucherzahlen.

Heuristiken:
- Familienfilme (Animation, Conni, Mario, Glennkill, etc.) am Nachmittag → hohe Besucher.
- Späte Abendvorstellungen (>22:00) → meist weniger Besucher, außer Premiere/Action-Blockbuster.
- Gleicher Film im selben Saal/zur ähnlichen Zeit in den Lerndaten ist der stärkste Anker.
- Wenn keine Lerndaten passen: orientiere dich an Intensität ("intense" → tendenziell mehr,
  "light" → tendenziell weniger).
- Werte sollten realistisch und unter der typischen Saalkapazität bleiben (eher 20-200).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach diesem Schema. Keine Markdown-Code-
Fences, kein Erklärtext außerhalb des JSON:
{
  "estimates": [
    { "show_id": 1234, "attendees": 75, "reason": "Familienfilm Nachmittag, ähnliche Vorst. hatten 60-90" }
  ],
  "notes": "kurze Gesamteinordnung"
}

Liefere für JEDE Show in SHOWS einen Eintrag, mit der passenden show_id.`;

type GeminiResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function estimateAttendeesWithAi(params: {
  shows: AttendeesShowInput[];
  learning: AttendeesLearningEntry[];
  model?: string;
}): Promise<AttendeesEstimateResult | null> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) return null;
  if (params.shows.length === 0) return { estimates: [] };

  const model = params.model ?? DEFAULT_MODEL;
  const userPayload = {
    SHOWS: params.shows,
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
          "Schätze die Besucherzahlen für diese Rutsche. Antworte nur mit dem JSON-Objekt.\n\n" +
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

  let parsed: { estimates?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(stripped);
  }

  const estimates: AttendeesEstimate[] = [];
  for (const e of Array.isArray(parsed.estimates) ? parsed.estimates : []) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    const showId = Number(row.show_id);
    const attendees = Number(row.attendees);
    if (!Number.isFinite(showId) || !Number.isFinite(attendees)) continue;
    estimates.push({
      show_id: Math.round(showId),
      attendees: Math.max(0, Math.round(attendees)),
      reason: typeof row.reason === "string" ? row.reason : undefined,
    });
  }
  return {
    estimates,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
  };
}
