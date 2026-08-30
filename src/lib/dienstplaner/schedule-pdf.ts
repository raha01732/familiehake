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

const EXTRACT_PROMPT = `Du extrahierst Schichten aus einem exportierten Dienstplan (Kino/Gastronomie).

DIESER PLAN IST EINE MATRIX:
- Die MITARBEITER stehen als SPALTENÜBERSCHRIFTEN oben, darunter jeweils ihre Rolle
  (Serviceleitung / Projektionsleitung / Projektion).
- Das DATUM steht als Zeilenkopf ganz links (Format DD.MM.YYYY, daneben der Wochentag).
- Jeder Tag umfasst MEHRERE Zeilen. In der Spalte eines Mitarbeiters steht bei einer
  Schicht die Startzeit und direkt darunter die Endzeit (z.B. "16:00" / "24:00").

SO GEHST DU VOR:
- Arbeite Spalte für Spalte (Mitarbeiter für Mitarbeiter). Lies in der Spalte GENAU
  dieses Mitarbeiters von oben nach unten je Datumszeile die Start-/Endzeit.
- Eine Schicht (Mitarbeiter, Datum) gibst du NUR aus, wenn die Zeit eindeutig in der
  Spalte dieses Mitarbeiters steht. Bist du dir bei der Spaltenzuordnung nicht sicher:
  weglassen.
- Pro Mitarbeiter und Datum höchstens EINE Schicht.

WAS NICHT AUSGEGEBEN WIRD:
- Die Spalte ganz links neben dem Datum ist die BEMERKUNGS-/EREIGNISSPALTE
  (z.B. "19:00 Uhr MET: ...", "11:00 Uhr MEK: Heidi", "15:00 +17:30 Uhr MILKAU:...").
  Diese Zeiten gehören zu KEINEM Mitarbeiter — niemals als Schicht ausgeben.
- Die Spalten ganz rechts (Ist, Soll, Urlaubstage, Krankheitstage) ignorieren.
- "F", "U", "K", "frei", "Urlaub", "krank", "Geburtstag", "Inventur", "Parkhaus",
  Feiertage und Dezimalzahlen wie "7,50" oder "8,00" sind KEINE Schichtzeiten.

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt nach diesem Schema. Kein Markdown, keine Code-Fences, kein Text davor oder danach:
{
  "period_start": "YYYY-MM-DD oder null",
  "period_end": "YYYY-MM-DD oder null",
  "shifts": [
    { "date": "YYYY-MM-DD", "name": "Spaltenüberschrift des Mitarbeiters", "position": "Rolle oder null", "start": "HH:MM oder null", "end": "HH:MM oder null" }
  ],
  "notes": "kurzer Hinweis auf Unsicherheiten oder null"
}

Regeln:
- Datum immer als ISO YYYY-MM-DD. Jahr aus Kopfzeile/Kontext ableiten.
- Zeiten im 24h-Format als HH:MM. "9-14" -> start "09:00", end "14:00".
- "name" MUSS exakt eine der Spaltenüberschriften sein. Ist eine Liste BEKANNTE
  MITARBEITER mitgegeben: "name" MUSS exakt ein Eintrag daraus sein. Passt ein
  gelesener Wert zu keiner Spalte/keinem Eintrag, lass die Zeile weg.
- Erfinde keine Namen, keine Zeiten und keine Zeilen. Lieber weglassen als raten.`;

function knownEmployeeBlock(employees: NameMatchInput[]): string {
  if (employees.length === 0) return "";
  const list = employees
    .map((e) => e.name.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((name) => `- ${name}`)
    .join("\n");
  if (!list) return "";
  return (
    `\n\nBEKANNTE MITARBEITER (die Spaltenüberschriften des Plans; "name" MUSS exakt einer davon sein):\n` +
    list
  );
}

// Namen, die keine Personen sind, aber in Zellen/Spalten auftauchen und von der
// KI gelegentlich als "name" ausgegeben werden.
const NON_PERSON_NAMES = new Set([
  "ist",
  "soll",
  "urlaubstage",
  "krankheitstage",
  "frei",
  "urlaub",
  "krank",
  "inventur",
  "parkhaus",
  "geburtstag",
  "bemerkung",
  "datum",
  "wotag",
  "projektion",
  "serviceleitung",
  "projektionsleitung",
  "f",
  "u",
  "k",
]);

export function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (!/\p{L}/u.test(trimmed)) return false; // keine Buchstaben
  if (NON_PERSON_NAMES.has(trimmed.toLowerCase())) return false;
  return true;
}

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

  const promptText =
    EXTRACT_PROMPT +
    knownEmployeeBlock(params.employees) +
    (params.fallbackYear ? `\n\nWenn im Plan kein Jahr steht, nimm ${params.fallbackYear}.` : "");

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
          temperature: 0,
          responseMimeType: "application/json",
          // Gemini 2.5 Flash rechnet Thinking-Tokens gegen maxOutputTokens.
          // Für die reine Extraktion ist Thinking unnötig und würde bei vollen
          // Monatsplänen den JSON-Output abschneiden.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 65536,
          // Höhere Render-Auflösung des PDFs — nötig, damit die KI bei sehr
          // breiten, eng gedruckten Matrix-Plänen die Spaltenzuordnung trifft.
          mediaResolution: "MEDIA_RESOLUTION_HIGH",
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
  // Bei ausreichend bekannten Mitarbeitern werden Namen verworfen, die zu
  // KEINEM Eintrag passen (erfundene Namen, grobe Lesefehler). Unsichere
  // Treffer ("low") bleiben erhalten und werden im Review markiert.
  const restrictToKnown = params.employees.length >= 3;

  const rows: ParsedScheduleRow[] = [];
  let idx = 0;
  let droppedNonPerson = 0;
  let droppedNoTime = 0;
  let droppedUnknown = 0;
  const seen = new Set<string>();

  for (const entry of shiftsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const date = normalizeIsoDate(r.date, params.fallbackYear);
    if (!date) continue;
    const rawName = typeof r.name === "string" ? r.name.trim() : "";
    if (!rawName || !looksLikePersonName(rawName)) {
      droppedNonPerson += 1;
      continue;
    }

    const startTime = normalizeHm(r.start);
    const endTime = normalizeHm(r.end);
    // Aus diesem Plantyp ist ein "Eintrag" ohne jede Uhrzeit fast immer ein
    // fehlinterpretiertes F/U/K oder eine Notiz.
    if (!startTime && !endTime) {
      droppedNoTime += 1;
      continue;
    }
    // Start == Ende ist keine Schicht.
    if (startTime && endTime && startTime === endTime) {
      droppedNoTime += 1;
      continue;
    }

    const match = matchEmployeeName(rawName, params.employees);
    if (restrictToKnown && match.matchConfidence === "none") {
      droppedUnknown += 1;
      continue;
    }

    // Pro Mitarbeiter/Tag höchstens eine Schicht (die erste gewinnt).
    const dedupKey = `${date}|${(match.matchedEmployeeId ?? rawName).toString().toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const position =
      typeof r.position === "string" && r.position.trim() ? r.position.trim().slice(0, 120) : null;
    idx += 1;
    rows.push({
      rowIndex: idx,
      date,
      rawName,
      matchedEmployeeId: match.matchedEmployeeId,
      matchConfidence: match.matchConfidence,
      matchCandidates: match.matchCandidates,
      position,
      startTime,
      endTime,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.rawName.localeCompare(b.rawName, "de"));

  const notes: string[] = [...salvageNotes];
  if (typeof raw.notes === "string" && raw.notes.trim()) notes.push(raw.notes.trim());
  if (rows.length === 0) {
    notes.push("Es konnten keine Schichten aus dem PDF gelesen werden.");
  }
  const droppedTotal = droppedNonPerson + droppedNoTime + droppedUnknown;
  if (droppedTotal > 0) {
    notes.push(
      `${droppedTotal} unplausible Zeile(n) automatisch entfernt ` +
        `(${droppedUnknown} nicht zuordenbar, ${droppedNoTime} ohne gültige Zeit, ${droppedNonPerson} kein Name).`
    );
  }
  const unmatched = rows.filter((r) => !r.matchedEmployeeId).length;
  if (unmatched > 0) {
    notes.push(`${unmatched} von ${rows.length} Namen ohne sichere Zuordnung — bitte im Review prüfen.`);
  }
  notes.push(
    "Matrix-Plan: bitte jede Zeile prüfen — bei eng gedruckten Spalten kann eine Zeit der falschen Person zugeordnet werden."
  );

  const periodStart =
    normalizeIsoDate(raw.period_start, params.fallbackYear) ?? rows[0]?.date ?? null;
  const periodEnd =
    normalizeIsoDate(raw.period_end, params.fallbackYear) ?? rows[rows.length - 1]?.date ?? null;

  return { periodStart, periodEnd, rows, notes };
}
