// src/lib/dienstplaner/schedule-pdf.ts
// Extrahiert Schichten aus einem hochgeladenen PDF-Altdienstplan über den
// nativen Gemini-Endpoint (multimodal, akzeptiert PDF als inline_data).
// Der OpenAI-kompatible Endpoint der anderen Dienstplaner-KI nimmt PDFs nicht
// zuverlässig an — daher hier ein eigener, schlanker Client.
import { env } from "@/lib/env";
import { matchEmployeeName, type NameMatchInput } from "./name-match";
import {
  normalizeHm,
  normalizeIsoDate,
  parseLooseJson,
  salvageScheduleJson,
} from "./schedule-parse";
import type { ParsedScheduleResult, ParsedScheduleRow } from "./import-types";

const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PDF_MB = 18;

export function schedulePdfImportEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

const EXTRACT_PROMPT = `Du extrahierst Schichten aus einem exportierten oder gescannten Dienstplan (Kino/Gastronomie).
Gib ALLE Einträge zurück, bei denen eine Person an einem Datum eine konkrete Schicht hat.

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach diesem Schema. Kein Markdown, keine Code-Fences, kein Text davor oder danach:
{
  "period_start": "YYYY-MM-DD oder null",
  "period_end": "YYYY-MM-DD oder null",
  "shifts": [
    { "date": "YYYY-MM-DD", "name": "voller Name wie im Plan", "position": "Rolle/Bereich oder null", "start": "HH:MM oder null", "end": "HH:MM oder null" }
  ],
  "notes": "kurzer Hinweis auf Unsicherheiten oder null"
}

Regeln:
- Datum immer als ISO YYYY-MM-DD. Wenn nur Tag und Monat sichtbar sind: Jahr aus Kopfzeile/Kontext ableiten.
- Zeiten im 24h-Format als HH:MM. "9-14" -> start "09:00", end "14:00". Unklar -> null.
- Nur echte Schichtzuordnungen ausgeben. Urlaub, frei, krank, Feiertag NICHT als Schicht ausgeben.
- Namen exakt wie im Plan übernehmen, keine Abkürzungen auflösen oder erfinden.
- Lieber eine unsichere Zeile weglassen als raten.`;

type GeminiNativeResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export async function extractScheduleFromPdf(params: {
  pdf: ArrayBuffer | Buffer;
  employees: NameMatchInput[];
  fallbackYear?: number;
}): Promise<ParsedScheduleResult> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ist nicht konfiguriert");
  const model = env().GEMINI_MODEL || DEFAULT_MODEL;

  const bytes = Buffer.isBuffer(params.pdf) ? params.pdf : Buffer.from(params.pdf);
  const sizeMb = bytes.byteLength / (1024 * 1024);
  if (sizeMb > MAX_PDF_MB) {
    throw new Error(
      `Das PDF ist ${sizeMb.toFixed(1)} MB groß (max. ${MAX_PDF_MB} MB). Bitte verkleinern oder aufteilen.`
    );
  }

  const promptText = params.fallbackYear
    ? `${EXTRACT_PROMPT}\n\nWenn im Plan kein Jahr steht, nimm ${params.fallbackYear}.`
    : EXTRACT_PROMPT;

  const res = await fetch(
    `${GEMINI_NATIVE_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "application/pdf", data: bytes.toString("base64") } },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          // Gemini 2.5 Flash rechnet Thinking-Tokens gegen maxOutputTokens.
          // Für die reine Extraktion ist Thinking unnötig und würde bei vollen
          // Monatsplänen den JSON-Output abschneiden.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 65536,
        },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as GeminiNativeResponse;
  if (json.error) {
    throw new Error(`Gemini-Fehler: ${json.error.message ?? json.error.status ?? "unbekannt"}`);
  }
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini hat die Anfrage blockiert (${json.promptFeedback.blockReason}).`);
  }

  const finishReason = json.candidates?.[0]?.finishReason ?? "unbekannt";
  const content =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  if (!content) {
    throw new Error(
      `Gemini hat keine verwertbare Antwort geliefert (finishReason=${finishReason}). ` +
        `Bei sehr großen Plänen hilft es, das PDF pro Monat aufzuteilen.`
    );
  }

  const salvageNotes: string[] = [];
  let parsed = parseLooseJson(content);
  if (!parsed || typeof parsed !== "object") {
    const salvaged = salvageScheduleJson(content);
    if (salvaged) {
      parsed = salvaged;
      salvageNotes.push(
        `Die Antwort war unvollständig (${finishReason}); ${salvaged.shifts.length} Schichten konnten gerettet werden. ` +
          `Bitte prüfen, ob am Ende des Zeitraums Einträge fehlen — ggf. das PDF pro Monat aufteilen.`
      );
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      `Gemini hat kein verwertbares JSON geliefert (finishReason=${finishReason}). ` +
        `Anfang: ${content.slice(0, 200)}`
    );
  }

  const raw = parsed as Record<string, unknown>;
  const shiftsRaw = Array.isArray(raw.shifts) ? raw.shifts : [];
  const rows: ParsedScheduleRow[] = [];
  let idx = 0;
  for (const entry of shiftsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const date = normalizeIsoDate(r.date, params.fallbackYear);
    if (!date) continue;
    const rawName = typeof r.name === "string" ? r.name.trim() : "";
    if (!rawName) continue;
    const position =
      typeof r.position === "string" && r.position.trim() ? r.position.trim().slice(0, 120) : null;
    idx += 1;
    const match = matchEmployeeName(rawName, params.employees);
    rows.push({
      rowIndex: idx,
      date,
      rawName,
      matchedEmployeeId: match.matchedEmployeeId,
      matchConfidence: match.matchConfidence,
      matchCandidates: match.matchCandidates,
      position,
      startTime: normalizeHm(r.start),
      endTime: normalizeHm(r.end),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.rawName.localeCompare(b.rawName, "de"));

  const notes: string[] = [...salvageNotes];
  if (typeof raw.notes === "string" && raw.notes.trim()) notes.push(raw.notes.trim());
  if (rows.length === 0) {
    notes.push("Es konnten keine Schichten aus dem PDF gelesen werden.");
  }
  const unmatched = rows.filter((r) => !r.matchedEmployeeId).length;
  if (unmatched > 0) {
    notes.push(`${unmatched} von ${rows.length} Namen ohne sichere Zuordnung — bitte im Review prüfen.`);
  }

  const periodStart =
    normalizeIsoDate(raw.period_start, params.fallbackYear) ?? rows[0]?.date ?? null;
  const periodEnd =
    normalizeIsoDate(raw.period_end, params.fallbackYear) ?? rows[rows.length - 1]?.date ?? null;

  return { periodStart, periodEnd, rows, notes };
}
