// src/lib/auslassplanung/show-code.ts
// Erzeugt eine 7-Zeichen-Show-Kennung im Stil "a4t9023". Verzichtet auf
// verwechselbare Zeichen (0, o, O, 1, l, I) und nutzt cryptographisch sicheres
// Random. 32^7 ≈ 34 Mrd Kombinationen — Kollisionen sind in der Praxis
// vernachlässigbar, wir reichen sie aber an die DB-Unique-Constraint durch.
import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 Zeichen
const CODE_LENGTH = 7;

export function generateShowCode(): string {
  // 32 teilt 256 ohne Rest → keine Modulo-Bias bei einem 8-Bit-Byte
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Versucht, einen kollisionsfreien Code zu erzeugen, indem bei Konflikt
 *  mit der DB neu generiert wird. `isTaken` muss true zurückgeben, wenn der
 *  Code in der relevanten Quelle bereits existiert. */
export async function generateUniqueShowCode(
  isTaken: (code: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateShowCode();
    if (!(await isTaken(code))) return code;
  }
  throw new Error(`Konnte nach ${maxAttempts} Versuchen keinen eindeutigen Show-Code finden.`);
}
