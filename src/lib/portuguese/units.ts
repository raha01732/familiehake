// src/lib/portuguese/units.ts
// Statische Lehrplan-Struktur für den Portugiesisch-Vokabeltrainer.
// Die Vokabeln selbst liegen in der DB (portuguese_words.unit verweist hierher),
// die Reihenfolge hier bestimmt, in welcher Reihenfolge neue Vokabeln eingeführt werden.
export type PortugueseUnit = {
  id: number;
  title: string;
  description: string;
};

export const PORTUGUESE_UNITS: PortugueseUnit[] = [
  { id: 1, title: "Begrüßung & Grundfloskeln", description: "Hallo, bitte, danke, ja/nein" },
  { id: 2, title: "Zahlen 0–20", description: "Zählen & einfache Mengenangaben" },
  { id: 3, title: "Ich, du, er/sie – sein & haben", description: "Personalpronomen, ser/estar/ter" },
  { id: 4, title: "Familie", description: "Familienmitglieder benennen" },
  { id: 5, title: "Farben & Adjektive", description: "Grundfarben, groß/klein, gut/schlecht" },
  { id: 6, title: "Zeit & Wochentage", description: "Uhrzeit, Wochentage, heute/morgen" },
  { id: 7, title: "Essen & Trinken", description: "Grundnahrungsmittel, im Restaurant bestellen" },
  { id: 8, title: "Orte & Richtungen", description: "Links/rechts, hier/dort, Alltagsorte" },
  { id: 9, title: "Verben im Präsens", description: "Regelmäßige -ar/-er/-ir-Verben, ir/estar" },
  { id: 10, title: "Small Talk", description: "Sich vorstellen, nach dem Befinden fragen" },
];

export function unitTitle(unit: number): string {
  return PORTUGUESE_UNITS.find((u) => u.id === unit)?.title ?? `Einheit ${unit}`;
}
