// src/lib/auslassplanung/fup.ts
// FÜP-Import: Bild eines Filmübersichtsplans an Gemini Vision schicken
// und die Vorstellungen (Saal, Credit-Offset, Aufräumzeit, Titel) extrahieren.
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export type ParsedFupShow = {
  hall_number: number;
  credit_offset: string; // "HH:MM" — Beginn des Auslasses
  cleanup_minutes: number; // Reinigungsdauer in Minuten
  movie_title: string | null;
  intensity_hint: "light" | "standard" | "intense";
  fsk: number | null;
};

export type FupParseResult = {
  date: string | null; // "YYYY-MM-DD" oder null
  shows: ParsedFupShow[];
  warning?: string;
};

const SYSTEM_PROMPT = `Du bist ein Kino-Disposition-Helfer. Du erhältst das Foto eines
Filmübersichtsplans (FÜP). Lies aus der Tabelle pro Zeile folgende Werte aus.

Das Bild kann um 90° gedreht erscheinen. Spalten (in dieser Reihenfolge):
- "Saal": z.B. "Kino 1" → hall_number=1, "Kino 8" → hall_number=8
- "Vorstellung-Start": IGNORIEREN
- "Feature-Start": IGNORIEREN
- "Pause": IGNORIEREN
- "Credit-Offset": Beginn des Auslasses (Reinigung) im Format HH:MM → "credit_offset"
- "Ende": IGNORIEREN
- "Filmtitel" → "movie_title" (bereinige Präfixe wie "2D", "OV:", "ATMOS:" — die Präfixe
  weglassen, aber den eigentlichen Titel behalten. Beispiel: "2D Der Teufel trägt Prada 2" →
  "Der Teufel trägt Prada 2"). Wenn der Titel mehrere Zeilen umfasst, zusammenführen.
- "FSK": numerische Altersfreigabe (0, 6, 12, 16, 18) → "fsk"
- "Aufräumzeit": Reinigungsdauer im Format HH:MM (z.B. "00:29" = 29min, "01:14" = 74min,
  "00:18" = 18min) — KONVERTIERE in ganze Minuten → "cleanup_minutes"
- "Release": IGNORIEREN

Wenn am oberen Rand des FÜP ein Datum erkennbar ist, gib es als ISO-Datum zurück
("date": "YYYY-MM-DD"). Wenn nicht erkennbar, "date": null.

intensity_hint — Reinigungsintensität pro Vorstellung. Stütze deine Einschätzung auf:
1. Dein allgemeines Wissen über den Film (Zielgruppe, Genre, Erfahrungen aus dem Kinoalltag).
2. FSK als zusätzlichen Indikator.
3. Plausibilitätsregeln:
   - "intense": viel Müll und Schmutz zu erwarten. Typischerweise Familien- und Animationsfilme
     (Disney-/Pixar-Filme, Conni, Mario, Tom & Jerry, Paw Patrol etc.), Event-Vorstellungen
     mit Snacks/Getränken, Schul- oder Kindergeburtstags-Klientel, Vorpremieren oder
     ausverkaufte Vorstellungen. FSK 0/6 + Kinderfilm-Charakter ist ein starker Hinweis,
     reicht aber alleine nicht — schau auf den Film selbst.
   - "light": ruhige Vorstellungen mit erwartbar wenig Müll: Arthouse, Programmkino,
     dokumentarische Filme, OV-Vorstellungen mit kleinerem Publikum, Vormittagsvorstellungen
     für Erwachsene ohne Snacks.
   - "standard": alles Übrige — normale Spielfilme, durchschnittliches Publikum.
Wenn du den Film nicht eindeutig kennst, leite anhand von Titel und FSK eine plausible
Einschätzung ab und bleibe im Zweifel bei "standard".

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach diesem Schema. Keine Markdown-Code-Fences,
kein erklärender Text außerhalb des JSON:
{
  "date": "2026-05-17",
  "shows": [
    {
      "hall_number": 1,
      "credit_offset": "14:55",
      "cleanup_minutes": 29,
      "movie_title": "Der Teufel trägt Prada 2 - Abenteuer mit Kranich Klaus",
      "fsk": 0,
      "intensity_hint": "intense"
    }
  ]
}

WICHTIG: Lies wirklich JEDE Zeile aus dem FÜP — auch wenn die Tabelle lang ist. Gib keine
zusammengefassten oder erratenen Daten aus, nur was du tatsächlich liest.`;

type GeminiResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export function fupImportEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export async function analyzeFupImage(params: {
  dataUri: string;
  model?: string;
}): Promise<FupParseResult> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY nicht gesetzt — FÜP-Import nicht verfügbar.");
  }
  const model = params.model ?? DEFAULT_MODEL;

  const body = {
    model,
    response_format: { type: "json_object" } as const,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hier ist der FÜP. Lies bitte alle Zeilen aus und antworte als JSON-Objekt.",
          },
          { type: "image_url", image_url: { url: params.dataUri } },
        ],
      },
    ],
    temperature: 0.1,
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

  let parsed: { date?: string | null; shows?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(stripped);
  }

  return normalizeFupResult(parsed);
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeCleanupMinutes(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      const total = Number(m[1]) * 60 + Number(m[2]);
      return Math.max(1, total);
    }
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(1, Math.round(n));
  }
  return 15;
}

function normalizeIntensity(value: unknown): "light" | "standard" | "intense" {
  return value === "light" || value === "intense" ? value : "standard";
}

function normalizeFupResult(raw: { date?: unknown; shows?: unknown }): FupParseResult {
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim())
      ? raw.date.trim()
      : null;

  const inShows = Array.isArray(raw.shows) ? raw.shows : [];
  const shows: ParsedFupShow[] = [];
  for (const r of inShows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const hall = Number(row.hall_number ?? row.hall ?? row.saal);
    const credit = normalizeTime(row.credit_offset ?? row.creditOffset);
    if (!Number.isFinite(hall) || hall <= 0 || !credit) continue;
    const cleanup = normalizeCleanupMinutes(row.cleanup_minutes ?? row.cleanupMinutes ?? row.aufraeumzeit);
    const titleRaw = row.movie_title ?? row.title ?? row.filmtitel;
    const movie_title =
      typeof titleRaw === "string" && titleRaw.trim().length > 0 ? titleRaw.trim() : null;
    const fskRaw = row.fsk;
    const fsk = typeof fskRaw === "number" && Number.isFinite(fskRaw) ? fskRaw : null;
    const intensity = normalizeIntensity(row.intensity_hint ?? row.intensityHint);
    shows.push({
      hall_number: Math.round(hall),
      credit_offset: credit,
      cleanup_minutes: cleanup,
      movie_title,
      fsk,
      intensity_hint: intensity,
    });
  }

  return { date, shows };
}
