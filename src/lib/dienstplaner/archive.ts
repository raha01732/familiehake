// Übernimmt die Schichten eines (abgeschlossenen) Monats aus dem Monatsplan in die Trainingsdaten
// (dienstplan_history_shifts). Wird vom Knopf "Monat ins Archiv übernehmen" genutzt und kann später
// von einem Cron aufgerufen werden (siehe src/app/api/cron/archive-dienstplan, derzeit nicht aktiviert).
import type { createAdminClient } from "@/lib/supabase/admin";

export type ArchiveResult = {
  ok: boolean;
  month: string;
  message: string;
  /** neu in die Trainingsdaten geschrieben */
  written: number;
  /** schon vorhanden (z. B. aus einem PDF-Import) und unverändert gelassen */
  alreadyPresent: number;
  /** Schichten ohne Uhrzeit bzw. ohne bekannte Person */
  skipped: number;
};

type ShiftRow = {
  employee_id: number;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  position?: string | null;
};

type EmployeeRow = { id: number; name: string; position: string | null };

export type HistoryInsertRow = {
  shift_date: string;
  employee_name: string;
  employee_id: number;
  position: string | null;
  start_time: string;
  end_time: string;
  source_note: string;
};

export function archiveSourceNote(month: string) {
  return `Monatsplan ${month}`;
}

/** Reine Umwandlung: Monatsplan-Schichten → Zeilen für die Trainingsdaten. */
export function buildHistoryRows(
  month: string,
  shifts: ShiftRow[],
  employees: EmployeeRow[]
): { rows: HistoryInsertRow[]; skipped: number } {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const rows: HistoryInsertRow[] = [];
  let skipped = 0;
  for (const shift of shifts) {
    const employee = byId.get(shift.employee_id);
    if (!employee || !shift.start_time || !shift.end_time) {
      skipped += 1;
      continue;
    }
    rows.push({
      shift_date: shift.shift_date,
      employee_name: employee.name,
      employee_id: employee.id,
      // Position der Schicht (aus dem Slot), sonst die Standardposition der Person
      position: shift.position?.trim() || employee.position?.trim() || null,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      source_note: archiveSourceNote(month),
    });
  }
  return { rows, skipped };
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10),
  };
}

export async function archiveMonthToHistory(
  sb: ReturnType<typeof createAdminClient>,
  month: string
): Promise<ArchiveResult> {
  const fail = (message: string): ArchiveResult => ({
    ok: false,
    month,
    message,
    written: 0,
    alreadyPresent: 0,
    skipped: 0,
  });

  const range = monthRange(month);
  if (!range) return fail("Ungültiger Monat.");
  if (range.start > new Date().toISOString().slice(0, 10)) {
    return fail("Dieser Monat hat noch nicht begonnen – es gibt nichts zu archivieren.");
  }

  // position ist erst nach der Migration vorhanden → tolerant lesen
  let shiftData: unknown[] | null;
  const withPosition = await sb
    .from("dienstplan_shifts")
    .select("employee_id, shift_date, start_time, end_time, position")
    .gte("shift_date", range.start)
    .lte("shift_date", range.end);
  if (!withPosition.error) {
    shiftData = withPosition.data;
  } else {
    const plain = await sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end);
    if (plain.error) return fail(`Schichten konnten nicht gelesen werden: ${plain.error.message}`);
    shiftData = plain.data;
  }

  // Auch inaktive Personen: ihre Schichten gehören zur Historie
  const employeesResult = await sb.from("dienstplan_employees").select("id, name, position");
  if (employeesResult.error) return fail(`Mitarbeitende konnten nicht gelesen werden: ${employeesResult.error.message}`);

  const { rows, skipped } = buildHistoryRows(
    month,
    (shiftData ?? []) as ShiftRow[],
    (employeesResult.data ?? []) as EmployeeRow[]
  );
  if (rows.length === 0) return { ...fail("Im Monatsplan gibt es keine Schichten mit Uhrzeit."), skipped };

  // Frühere Archivierung desselben Monats ersetzen, damit nachträgliche Korrekturen keine Altlasten hinterlassen
  const { error: deleteError } = await sb
    .from("dienstplan_history_shifts")
    .delete()
    .eq("source_note", archiveSourceNote(month))
    .gte("shift_date", range.start)
    .lte("shift_date", range.end);
  if (deleteError) return fail(`Frühere Archivierung konnte nicht ersetzt werden: ${deleteError.message}`);

  // Bereits vorhandene Zeilen (z. B. aus einem PDF-Import) bleiben unverändert
  const { data: inserted, error } = await sb
    .from("dienstplan_history_shifts")
    .upsert(rows, { onConflict: "shift_date,employee_name,start_time,end_time", ignoreDuplicates: true })
    .select("id");
  if (error) return fail(`Archivierung fehlgeschlagen: ${error.message}`);

  const written = inserted?.length ?? 0;
  const alreadyPresent = rows.length - written;
  const parts = [`${written} Schicht${written === 1 ? "" : "en"} ins Archiv übernommen`];
  if (alreadyPresent > 0) parts.push(`${alreadyPresent} waren schon vorhanden`);
  if (skipped > 0) parts.push(`${skipped} ohne Uhrzeit/Person übersprungen`);
  return { ok: true, month, message: `${parts.join(", ")}.`, written, alreadyPresent, skipped };
}
