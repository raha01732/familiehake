// src/lib/dienstplaner/name-match.ts
// Ordnet Freitext-Namen (aus PDF/Excel) den angelegten Dienstplaner-Mitarbeitern
// zu. Reine Funktion — keine Server-Abhängigkeiten, damit testbar.
import type { EmployeeMatchCandidate, MatchConfidence } from "./import-types";

export type NameMatchInput = {
  id: number;
  name: string;
};

export type NameMatchResult = {
  matchedEmployeeId: number | null;
  matchConfidence: MatchConfidence;
  matchCandidates: EmployeeMatchCandidate[];
};

/** Kleinbuchstaben, Diakritika weg, Sonderzeichen zu Space, Mehrfach-Space kollabiert. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalizeName(value).split(" ").filter(Boolean);
}

/** Levenshtein-Distanz, für Tippfehler-Toleranz bei kurzen Namen. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Score 0..1 zwischen zwei Namen. Berücksichtigt volle Gleichheit,
 * Token-Überschneidung (Vor-/Nachname in beliebiger Reihenfolge) und
 * "Nachname, Vorname"-Schreibweise.
 */
function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Abkürzungs-Match: gleich viele Namensteile und jedes Token des einen Namens
  // ist Präfix eines eigenen Tokens des anderen ("Dirk Lüb. Nyssen" ↔
  // "Dirk Lübbe Nyssen", "D. Möders. Vagtmeier" ↔ "Daria Möders Vagtmeier").
  if (ta.length === tb.length && ta.length >= 2) {
    const used = new Array<boolean>(tb.length).fill(false);
    let allPrefix = true;
    for (const t of ta) {
      const j = tb.findIndex(
        (other, k) => !used[k] && (other.startsWith(t) || t.startsWith(other))
      );
      if (j === -1) {
        allPrefix = false;
        break;
      }
      used[j] = true;
    }
    if (allPrefix) {
      const exactTokens = ta.filter((t, i) => t === tb[i]).length;
      if (exactTokens === ta.length) return 1;
      // Mindestens ein Namensteil exakt gleich → als Abkürzung behandeln.
      if (exactTokens >= 1) return 0.85;
    }
  }

  const setA = new Set(ta);
  const setB = new Set(tb);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = shared / union;

  // Beide Namensteile identisch (nur Reihenfolge/Komma anders) → sehr hoch.
  if (shared >= 2 && shared === Math.min(setA.size, setB.size)) {
    return 0.95;
  }
  // Ein Namensteil exakt gleich (z.B. nur Vorname erfasst) → mittel.
  if (shared === 1) {
    return 0.6 + jaccard * 0.2;
  }

  // Kein gemeinsames Token: Tippfehler-Nähe auf der Gesamtzeichenkette prüfen.
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  const ratio = 1 - dist / maxLen;
  return ratio > 0.82 ? ratio * 0.7 : ratio * 0.3;
}

/**
 * Bestes Match + Alternativvorschläge für das Review-Dropdown.
 *  - score === 1        → "exact"
 *  - score >= 0.8       → "high"
 *  - score >= 0.5       → "low"  (Vorauswahl, aber im Review markiert)
 *  - sonst              → "none" (kein Vorschlag)
 */
export function matchEmployeeName(
  rawName: string,
  employees: NameMatchInput[]
): NameMatchResult {
  const trimmed = rawName.trim();
  if (!trimmed || employees.length === 0) {
    return { matchedEmployeeId: null, matchConfidence: "none", matchCandidates: [] };
  }

  const scored = employees
    .map((emp) => ({ emp, score: similarity(trimmed, emp.name) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const candidates: EmployeeMatchCandidate[] = scored
    .filter((s) => s.score >= 0.4)
    .slice(0, 5)
    .map((s) => ({ id: s.emp.id, name: s.emp.name }));

  if (!best || best.score < 0.5) {
    return { matchedEmployeeId: null, matchConfidence: "none", matchCandidates: candidates };
  }

  let confidence: MatchConfidence = "low";
  if (best.score >= 1) confidence = "exact";
  else if (best.score >= 0.8) confidence = "high";

  return {
    matchedEmployeeId: best.emp.id,
    matchConfidence: confidence,
    matchCandidates: candidates,
  };
}
