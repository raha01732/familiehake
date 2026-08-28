// src/lib/portuguese/leitner.ts
// Einfaches Leitner-System für die Wiederholungs-Intervalle der Vokabelkarten.
// Box 0 = noch nie gelernt (sofort fällig). Box 1–5 = zunehmend größere Abstände.
export const MAX_BOX = 5;

const INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 16,
  5: 35,
};

export function intervalDays(box: number): number {
  return INTERVAL_DAYS[box] ?? 1;
}

/** Nächste Box nach einer Wiederholung: richtig -> eine Box weiter, falsch -> zurück auf Box 1. */
export function nextBox(currentBox: number, correct: boolean): number {
  if (!correct) return 1;
  return Math.min(currentBox + 1, MAX_BOX);
}

/** Fälligkeitsdatum für die neue Box, ausgehend von jetzt. */
export function nextReviewAt(box: number, from: Date = new Date()): Date {
  const days = intervalDays(box);
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
