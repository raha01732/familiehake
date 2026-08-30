// src/lib/dienstplaner/schedule-parse.ts
// Reine Normalisierer für den PDF-Dienstplan-Import. Keine Server-Abhängigkeit.
import { pad2 } from "./availability-parse";

/** Beliebige Datumsangabe → YYYY-MM-DD, sonst null. */
export function normalizeIsoDate(value: unknown, fallbackYear?: number): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y: number;
    if (m[3]) {
      y = Number(m[3]);
      if (m[3].length === 2) y += 2000;
    } else if (fallbackYear) {
      y = fallbackYear;
    } else {
      return null;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  return null;
}

/** "9", "9:5", "09.00", "9-14" (nimmt Start) → HH:MM, sonst null. */
export function normalizeHm(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})(?:[:.h](\d{1,2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/**
 * Rettet aus einer abgeschnittenen Antwort (Token-Limit) so viele vollständige
 * shift-Objekte wie möglich. Gibt null zurück, wenn nichts brauchbar ist.
 */
export function salvageScheduleJson(content: string): {
  period_start: string | null;
  period_end: string | null;
  shifts: unknown[];
} | null {
  const shiftsKey = content.search(/"shifts"\s*:\s*\[/);
  if (shiftsKey === -1) return null;
  const arrStart = content.indexOf("[", shiftsKey);
  if (arrStart === -1) return null;

  const objects: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrStart + 1; i < content.length; i += 1) {
    const ch = content[i];
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
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(content.slice(objStart, i + 1)));
        } catch {
          // unvollständiges Objekt überspringen
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (objects.length === 0) return null;
  const ps = content.match(/"period_start"\s*:\s*"([^"]+)"/);
  const pe = content.match(/"period_end"\s*:\s*"([^"]+)"/);
  return { period_start: ps?.[1] ?? null, period_end: pe?.[1] ?? null, shifts: objects };
}

/** Findet das erste balancierte Top-Level-JSON-Objekt in einem String. */
export function parseLooseJson(input: string): unknown {
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // weiter
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // weiter
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
