// src/lib/dienstplaner/import-types.ts
// Geteilte Typen für die Dienstplaner-Import-Pipeline (PDF-Altdienstpläne +
// Excel-Verfügbarkeiten). Bewusst frei von Server-Only-Imports, damit die
// reinen Parser/Matcher-Helfer auch in Tests laufen.

export type ImportKind = "schedule_pdf" | "availability_xlsx";

export type MatchConfidence = "exact" | "high" | "low" | "none";

export type EmployeeMatchCandidate = {
  id: number;
  name: string;
};

/** Eine erkannte Verfügbarkeits-Zelle (ein Tag eines Mitarbeiters). */
export type ParsedAvailabilityEntry = {
  date: string; // YYYY-MM-DD
  rawValue: string;
  status: string | null; // gemappter Code: F | U | K | fr | sp | fix — null = verfügbar/leer
  fixedStart: string | null; // HH:MM, nur bei status === "fix"
  fixedEnd: string | null;
  /** false => Wert konnte nicht sicher zugeordnet werden, im Review prüfen. */
  mapped: boolean;
};

export type ParsedAvailabilityRow = {
  rowIndex: number; // Zeilennummer in der Quelldatei (nur Anzeige)
  rawName: string;
  matchedEmployeeId: number | null;
  matchConfidence: MatchConfidence;
  matchCandidates: EmployeeMatchCandidate[];
  entries: ParsedAvailabilityEntry[];
};

export type ParsedAvailabilityResult = {
  periodStart: string | null;
  periodEnd: string | null;
  rows: ParsedAvailabilityRow[];
  notes: string[];
};

/** Eine erkannte historische Schicht aus einem PDF-Altdienstplan. */
export type ParsedScheduleRow = {
  rowIndex: number;
  date: string; // YYYY-MM-DD
  rawName: string;
  matchedEmployeeId: number | null;
  matchConfidence: MatchConfidence;
  matchCandidates: EmployeeMatchCandidate[];
  position: string | null;
  startTime: string | null; // HH:MM
  endTime: string | null;
};

export type ParsedScheduleResult = {
  periodStart: string | null;
  periodEnd: string | null;
  rows: ParsedScheduleRow[];
  notes: string[];
};

export type ImportRecord = {
  id: number;
  kind: ImportKind;
  file_name: string;
  status: "parsed" | "confirmed" | "discarded" | "error";
  period_start: string | null;
  period_end: string | null;
  parse_notes: string | null;
  error_message: string | null;
  row_count: number;
  confirmed_count: number | null;
  created_at: string;
  confirmed_at: string | null;
};
