// src/app/tools/dienstplaner/import-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit, actorFromUser } from "@/lib/audit";
import { assertDienstplanImportAdmin } from "@/lib/dienstplaner/import-guard";
import {
  computeHistoryInsights,
  type HistoryShift,
} from "@/lib/dienstplaner/history-insights";

const PLAN_PATH = "/tools/dienstplaner";
const AVAIL_PATH = "/tools/dienstplaner/verfuegbarkeit";
const IMPORT_PATH = "/tools/dienstplaner/import";

const VALID_STATUS = new Set(["F", "U", "K", "fr", "sp", "fix"]);

function normTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type ConfirmAvailabilityRow = {
  employeeId: number | null;
  entries: Array<{
    date: string;
    status: string | null;
    fixedStart: string | null;
    fixedEnd: string | null;
    include: boolean;
  }>;
};

export async function confirmAvailabilityImportAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();

  const importId = Number(formData.get("import_id"));
  const overwrite = formData.get("overwrite") === "true";
  if (!Number.isFinite(importId)) throw new Error("INVALID_IMPORT_ID");

  let rows: ConfirmAvailabilityRow[];
  try {
    rows = JSON.parse(String(formData.get("payload") || "[]"));
  } catch {
    throw new Error("INVALID_PAYLOAD");
  }
  if (!Array.isArray(rows)) throw new Error("INVALID_PAYLOAD");

  const sb = createAdminClient();
  const { data: importRow } = await sb
    .from("dienstplan_imports")
    .select("id, kind, status")
    .eq("id", importId)
    .maybeSingle();
  if (!importRow || importRow.kind !== "availability_xlsx") throw new Error("IMPORT_NOT_FOUND");

  type Upsert = {
    employee_id: number;
    availability_date: string;
    status: string | null;
    fixed_start: string | null;
    fixed_end: string | null;
  };
  const upserts: Upsert[] = [];
  const deletions: { employee_id: number; availability_date: string }[] = [];

  for (const row of rows) {
    const employeeId = Number(row?.employeeId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) continue;
    for (const entry of Array.isArray(row.entries) ? row.entries : []) {
      if (!entry?.include || !isIsoDate(entry.date)) continue;
      const status = entry.status;
      if (status === null || status === "" || status === "clear") {
        deletions.push({ employee_id: employeeId, availability_date: entry.date });
        continue;
      }
      if (!VALID_STATUS.has(status)) continue;
      let fixedStart: string | null = null;
      let fixedEnd: string | null = null;
      if (status === "fix") {
        fixedStart = normTime(entry.fixedStart);
        fixedEnd = normTime(entry.fixedEnd);
        if (!fixedStart || !fixedEnd) continue; // fix ohne gültige Zeiten überspringen
      }
      upserts.push({
        employee_id: employeeId,
        availability_date: entry.date,
        status,
        fixed_start: fixedStart,
        fixed_end: fixedEnd,
      });
    }
  }

  let written = 0;
  let skipped = 0;

  if (!overwrite && upserts.length > 0) {
    const dates = [...new Set(upserts.map((u) => u.availability_date))].sort();
    const empIds = [...new Set(upserts.map((u) => u.employee_id))];
    const { data: existing } = await sb
      .from("dienstplan_availability")
      .select("employee_id, availability_date")
      .in("employee_id", empIds)
      .gte("availability_date", dates[0])
      .lte("availability_date", dates[dates.length - 1]);
    const taken = new Set(
      (existing ?? []).map((e) => `${e.employee_id}-${e.availability_date}`)
    );
    const filtered = upserts.filter((u) => {
      const hit = taken.has(`${u.employee_id}-${u.availability_date}`);
      if (hit) skipped += 1;
      return !hit;
    });
    upserts.length = 0;
    upserts.push(...filtered);
  }

  if (upserts.length > 0) {
    const { error } = await sb
      .from("dienstplan_availability")
      .upsert(upserts, { onConflict: "employee_id,availability_date" });
    if (error) throw new Error(`DB-Fehler beim Speichern: ${error.message}`);
    written += upserts.length;
  }

  for (const del of deletions) {
    await sb
      .from("dienstplan_availability")
      .delete()
      .eq("employee_id", del.employee_id)
      .eq("availability_date", del.availability_date);
    written += 1;
  }

  await sb
    .from("dienstplan_imports")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_count: written })
    .eq("id", importId);

  await logAudit({
    action: "dienstplan_import_confirm",
    ...actorFromUser(user),
    target: `import:${importId}`,
    detail: { kind: "availability_xlsx", written, skipped, overwrite },
  });

  revalidatePath(AVAIL_PATH);
  revalidatePath(PLAN_PATH);
  revalidatePath(IMPORT_PATH);
  return { written, skipped };
}

type ConfirmScheduleRow = {
  date: string;
  employeeId: number | null;
  employeeName: string;
  position: string | null;
  startTime: string | null;
  endTime: string | null;
  comment: string | null;
  include: boolean;
};

export async function confirmScheduleImportAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();

  const importId = Number(formData.get("import_id"));
  if (!Number.isFinite(importId)) throw new Error("INVALID_IMPORT_ID");

  let rows: ConfirmScheduleRow[];
  try {
    rows = JSON.parse(String(formData.get("payload") || "[]"));
  } catch {
    throw new Error("INVALID_PAYLOAD");
  }
  if (!Array.isArray(rows)) throw new Error("INVALID_PAYLOAD");

  const sb = createAdminClient();
  const { data: importRow } = await sb
    .from("dienstplan_imports")
    .select("id, kind, status")
    .eq("id", importId)
    .maybeSingle();
  if (!importRow || importRow.kind !== "schedule_pdf") throw new Error("IMPORT_NOT_FOUND");

  type HistoryInsert = {
    import_id: number;
    shift_date: string;
    employee_name: string;
    employee_id: number | null;
    position: string | null;
    start_time: string | null;
    end_time: string | null;
    source_note: string | null;
  };
  const seen = new Set<string>();
  const inserts: HistoryInsert[] = [];
  for (const row of rows) {
    if (!row?.include || !isIsoDate(row.date)) continue;
    const employeeName = String(row.employeeName || "").trim().slice(0, 160);
    if (!employeeName) continue;
    const employeeId =
      Number.isFinite(Number(row.employeeId)) && Number(row.employeeId) > 0
        ? Number(row.employeeId)
        : null;
    const startTime = normTime(row.startTime);
    const endTime = normTime(row.endTime);
    const position =
      typeof row.position === "string" && row.position.trim()
        ? row.position.trim().slice(0, 120)
        : null;
    const sourceNote =
      typeof row.comment === "string" && row.comment.trim()
        ? row.comment.trim().slice(0, 400)
        : null;
    const dedupKey = `${row.date}|${employeeName.toLowerCase()}|${startTime ?? ""}|${endTime ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    inserts.push({
      import_id: importId,
      shift_date: row.date,
      employee_name: employeeName,
      employee_id: employeeId,
      position,
      start_time: startTime,
      end_time: endTime,
      source_note: sourceNote,
    });
  }

  let written = 0;
  if (inserts.length > 0) {
    const { error } = await sb
      .from("dienstplan_history_shifts")
      .upsert(inserts, { onConflict: "shift_date,employee_name,start_time,end_time" });
    if (error) throw new Error(`DB-Fehler beim Speichern: ${error.message}`);
    written = inserts.length;
  }

  await sb
    .from("dienstplan_imports")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_count: written })
    .eq("id", importId);

  await logAudit({
    action: "dienstplan_import_confirm",
    ...actorFromUser(user),
    target: `import:${importId}`,
    detail: { kind: "schedule_pdf", written },
  });

  revalidatePath(PLAN_PATH);
  revalidatePath(IMPORT_PATH);
  return { written };
}

export async function discardImportAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();
  const importId = Number(formData.get("import_id"));
  if (!Number.isFinite(importId)) throw new Error("INVALID_IMPORT_ID");

  const sb = createAdminClient();
  await sb.from("dienstplan_imports").update({ status: "discarded" }).eq("id", importId);

  await logAudit({
    action: "dienstplan_import_discard",
    ...actorFromUser(user),
    target: `import:${importId}`,
  });

  revalidatePath(IMPORT_PATH);
}

/**
 * Übernimmt die aus der Historie ermittelte Ø-Besetzung je Wochentag als
 * numerischen Wochentags-Grundbedarf (dienstplan_weekday_requirements).
 * Bewusst nur der niedrig-riskante numerische Bedarf — die Positions-Matrix
 * bleibt manuell.
 */
export async function applyHistoryWeekdayHeadcountAction() {
  const user = await assertDienstplanImportAdmin();

  const sb = createAdminClient();
  const { data } = await sb
    .from("dienstplan_history_shifts")
    .select("shift_date, employee_name, employee_id, position, start_time, end_time, source_note")
    .order("shift_date", { ascending: false })
    .limit(6000);

  const insights = computeHistoryInsights((data ?? []) as HistoryShift[]);
  if (insights.weekdayHeadcount.length === 0) {
    throw new Error("Zu wenig Historie — noch keine bestätigten PDF-Importe.");
  }

  const upserts = insights.weekdayHeadcount.map((w) => ({
    weekday: w.weekday,
    required_shifts: Math.max(0, Math.round(w.avgHeadcount)),
  }));
  const { error } = await sb
    .from("dienstplan_weekday_requirements")
    .upsert(upserts, { onConflict: "weekday" });
  if (error) throw new Error(`DB-Fehler: ${error.message}`);

  await logAudit({
    action: "dienstplan_requirement_save",
    ...actorFromUser(user),
    detail: { kind: "Wochentag-Bedarf", source: "history", weekdays: upserts.length },
  });

  revalidatePath(PLAN_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(IMPORT_PATH);
  return { updated: upserts.map((u) => ({ weekday: u.weekday, requiredShifts: u.required_shifts })) };
}

// ── Trainingsdaten nachträglich bearbeiten ───────────────────────────────
// Bestätigte historische Schichten (dienstplan_history_shifts) bleiben jederzeit
// korrigierbar, falls später ein Lesefehler auffällt.

export async function updateHistoryShiftAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_ID");

  const updates: Record<string, unknown> = {};

  if (formData.has("employee_id")) {
    const raw = String(formData.get("employee_id") || "").trim();
    updates.employee_id = raw ? Number(raw) : null;
    if (raw && !Number.isFinite(updates.employee_id)) throw new Error("INVALID_EMPLOYEE_ID");
  }
  if (formData.has("employee_name")) {
    const name = String(formData.get("employee_name") || "").trim().slice(0, 160);
    if (!name) throw new Error("EMPLOYEE_NAME_REQUIRED");
    updates.employee_name = name;
  }
  if (formData.has("shift_date")) {
    const d = String(formData.get("shift_date") || "").trim();
    if (!isIsoDate(d)) throw new Error("INVALID_DATE");
    updates.shift_date = d;
  }
  if (formData.has("start_time")) {
    const raw = String(formData.get("start_time") || "").trim();
    updates.start_time = raw ? normTime(raw) : null;
    if (raw && !updates.start_time) throw new Error("INVALID_START_TIME");
  }
  if (formData.has("end_time")) {
    const raw = String(formData.get("end_time") || "").trim();
    updates.end_time = raw ? normTime(raw) : null;
    if (raw && !updates.end_time) throw new Error("INVALID_END_TIME");
  }
  if (formData.has("position")) {
    const p = String(formData.get("position") || "").trim().slice(0, 120);
    updates.position = p || null;
  }
  if (formData.has("source_note")) {
    const n = String(formData.get("source_note") || "").trim().slice(0, 400);
    updates.source_note = n || null;
  }

  if (Object.keys(updates).length === 0) return { updated: 0 };

  const sb = createAdminClient();
  const { error } = await sb.from("dienstplan_history_shifts").update(updates).eq("id", id);
  if (error) throw new Error(`DB-Fehler: ${error.message}`);

  await logAudit({
    action: "dienstplan_history_edit",
    ...actorFromUser(user),
    target: `history:${id}`,
    detail: { fields: Object.keys(updates) },
  });

  revalidatePath(IMPORT_PATH);
  revalidatePath(PLAN_PATH);
  return { updated: 1 };
}

export async function deleteHistoryShiftAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) throw new Error("INVALID_ID");

  const sb = createAdminClient();
  const { error } = await sb.from("dienstplan_history_shifts").delete().eq("id", id);
  if (error) throw new Error(`DB-Fehler: ${error.message}`);

  await logAudit({
    action: "dienstplan_history_delete",
    ...actorFromUser(user),
    target: `history:${id}`,
  });

  revalidatePath(IMPORT_PATH);
  revalidatePath(PLAN_PATH);
  return { deleted: 1 };
}

/** Löscht alle historischen Schichten eines Imports und markiert ihn als verworfen. */
export async function deleteImportHistoryAction(formData: FormData) {
  const user = await assertDienstplanImportAdmin();
  const importId = Number(formData.get("import_id"));
  if (!Number.isFinite(importId) || importId <= 0) throw new Error("INVALID_IMPORT_ID");

  const sb = createAdminClient();
  const { data: removed, error } = await sb
    .from("dienstplan_history_shifts")
    .delete()
    .eq("import_id", importId)
    .select("id");
  if (error) throw new Error(`DB-Fehler: ${error.message}`);

  await sb.from("dienstplan_imports").update({ status: "discarded" }).eq("id", importId);

  await logAudit({
    action: "dienstplan_history_delete",
    ...actorFromUser(user),
    target: `import:${importId}`,
    detail: { deleted: removed?.length ?? 0 },
  });

  revalidatePath(IMPORT_PATH);
  revalidatePath(PLAN_PATH);
  return { deleted: removed?.length ?? 0 };
}
