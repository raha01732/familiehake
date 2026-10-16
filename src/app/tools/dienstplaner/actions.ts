// /workspace/familiehake/src/app/tools/dienstplaner/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { logAudit, actorFromUser, type AuditAction } from "@/lib/audit";
import {
  addHoursToTime,
  calculateShiftMinutes,
  calculateUrlaubMinutesByEmployee,
  generateAutoPlanSlots,
  inferPositionCategory,
  isAllowedForCategory,
  isServiceleitungInProjektion,
  normalizeAllowedPositions,
  type PauseRule,
  type AutoPlanResult,
  SERVICELEITUNG_IN_PROJEKTION_NOTE,
  type PositionCategory,
} from "./utils";
import { loadShiftRulesAndPeriods } from "@/lib/dienstplaner/rules-loader";
import { loadPlanningRules, normalizePlanningRules } from "@/lib/dienstplaner/planning-rules";
import { askAiToImprovePlan, dienstplanAiEnabled } from "@/lib/dienstplaner/ai";
import { improvePlanWithAi } from "@/lib/dienstplaner/plan-improve";
import {
  buildHistoryPromptBlock,
  computeHistoryInsights,
  type HistoryShift,
} from "@/lib/dienstplaner/history-insights";
import { assertDienstplanAvailabilityWrite } from "@/lib/dienstplaner/availability-guard";

import {
  CLOSED_DAY_POSITION,
  removeCoveredSlots,
  resolvePositionKind,
  slotRequiresLeader,
  slotsForDate,
  type DayRequirement,
  type RulePeriod,
  type ShiftRule,
} from "./requirements";

const PLAN_PATH = "/tools/dienstplaner";
const SETTINGS_PATH = "/tools/dienstplaner/settings";
const MITARBEITER_PATH = "/tools/dienstplaner/mitarbeiter";

function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function buildMonthDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1))) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function addDays(dateValue: string, daysToAdd: number) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

function normalizeTimeInput(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;
  const matchedTime = normalizedValue.match(/^(\d{2}):(\d{2})$/);
  if (!matchedTime) return null;
  const hours = Number(matchedTime[1]);
  const minutes = Number(matchedTime[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function assertAdminForDienstplanAutomation() {
  const user = await currentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }

  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isAdmin = role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;
  if (!isAdmin) {
    throw new Error("FORBIDDEN_ADMIN_ONLY");
  }
  return user;
}

/**
 * Schreibt ein Audit-Event für eine Dienstplaner-Aktion. Schluckt Fehler
 * bewusst (logAudit selbst wirft nie), damit die eigentliche Aktion robust
 * bleibt. `user` ist der aufrufende Clerk-User aus den Assert-Helfern.
 */
async function auditDienstplan(
  user: Awaited<ReturnType<typeof currentUser>>,
  action: AuditAction,
  detail: Record<string, unknown> | null = null,
  target: string | null = null
) {
  await logAudit({ action, ...actorFromUser(user), target, detail });
}

let shiftsHavePositionColumn = false;

/** Gibt es dienstplan_shifts.position schon (Migration)? Nur ein positives Ergebnis wird gemerkt. */
async function hasShiftPositionColumn(sb: ReturnType<typeof createAdminClient>) {
  if (!shiftsHavePositionColumn) {
    const { error } = await sb.from("dienstplan_shifts").select("position").limit(1);
    if (!error) shiftsHavePositionColumn = true;
  }
  return shiftsHavePositionColumn;
}

let plannedSlotsHaveLeaderColumn = false;

/** Spaltenliste für planned_slots; require_leader nur, wenn die Migration schon gelaufen ist. */
async function plannedSlotColumns(sb: ReturnType<typeof createAdminClient>, base: string) {
  if (!plannedSlotsHaveLeaderColumn) {
    const { error } = await sb.from("dienstplan_planned_slots").select("require_leader").limit(1);
    if (!error) plannedSlotsHaveLeaderColumn = true;
  }
  return plannedSlotsHaveLeaderColumn ? `${base}, require_leader` : base;
}

async function consumeMatchingPlannedSlot(
  sb: ReturnType<typeof createAdminClient>,
  shiftDate: string,
  startTime: string,
  endTime: string
) {
  const { data: candidate } = await sb
    .from("dienstplan_planned_slots")
    .select("id")
    .eq("slot_date", shiftDate)
    .eq("start_time", startTime)
    .eq("end_time", endTime)
    .is("assigned_employee_id", null)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (candidate?.id) {
    await sb.from("dienstplan_planned_slots").delete().eq("id", candidate.id);
  }
}

function toMinuteRange(startTime: string, endTime: string) {
  const [sh, sm] = startTime.slice(0, 5).split(":").map(Number);
  const [eh, em] = endTime.slice(0, 5).split(":").map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60; // Schicht über Mitternacht
  return { start, end };
}

/**
 * Entfernt den zeitlich am besten überlappenden offenen "Projektion"-Slot am
 * gegebenen Tag — aufgerufen, wenn eine Schicht als Doppelrolle
 * (Serviceleitung + Projektion) markiert wird, damit der rote Slot nicht
 * zusätzlich zur bereits besetzten Schicht angezeigt wird.
 */
async function consumeProjektionSlot(
  sb: ReturnType<typeof createAdminClient>,
  args: { slotDate: string; startTime: string; endTime: string }
) {
  const { data: openSlots } = (await sb
    .from("dienstplan_planned_slots")
    .select(await plannedSlotColumns(sb, "id, start_time, end_time, position"))
    .eq("slot_date", args.slotDate)
    .is("assigned_employee_id", null)) as unknown as {
    data: { id: number; start_time: string; end_time: string; position: string | null; require_leader?: boolean }[] | null;
  };

  const shiftRange = toMinuteRange(args.startTime, args.endTime);
  let bestId: number | null = null;
  let bestOverlap = -1;
  for (const candidate of openSlots ?? []) {
    if (inferPositionCategory(candidate.position) !== "projektion") continue;
    // Eine Doppelrolle (Serviceleitung) darf keinen Slot übernehmen, der die Projektionsleitung verlangt
    if (candidate.require_leader) continue;
    if (!candidate.start_time || !candidate.end_time) continue;
    const range = toMinuteRange(candidate.start_time, candidate.end_time);
    const overlap = Math.min(shiftRange.end, range.end) - Math.max(shiftRange.start, range.start);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestId = candidate.id;
    }
  }
  if (bestId !== null) {
    await sb.from("dienstplan_planned_slots").delete().eq("id", bestId);
  }
}

/**
 * Gegenstück zu consumeProjektionSlot: legt einen offenen "Projektion"-Slot
 * wieder an, wenn eine Doppelrollen-Markierung entfernt oder die zugehörige
 * Schicht gelöscht wird — außer es existiert bereits ein passender.
 */
async function reopenProjektionSlot(
  sb: ReturnType<typeof createAdminClient>,
  args: { slotDate: string; startTime: string; endTime: string }
) {
  const startKey = args.startTime.slice(0, 5);
  const endKey = args.endTime.slice(0, 5);
  const { data: openSlots } = await sb
    .from("dienstplan_planned_slots")
    .select("id, start_time, end_time, position")
    .eq("slot_date", args.slotDate)
    .is("assigned_employee_id", null);

  const alreadyOpen = (openSlots ?? []).some(
    (s) =>
      inferPositionCategory(s.position) === "projektion" &&
      s.start_time?.slice(0, 5) === startKey &&
      s.end_time?.slice(0, 5) === endKey
  );
  if (alreadyOpen) return;

  await sb.from("dienstplan_planned_slots").insert({
    slot_date: args.slotDate,
    position: "Projektion",
    track_key: null,
    start_time: args.startTime,
    end_time: args.endTime,
    note: null,
    source: "reopened-after-double-duty-removed",
  });
}

async function assertAuthenticatedForDienstplanWrite() {
  const user = await currentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }

  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isPrivilegedUser = role === "admin" || role === "user" || user.id === env().PRIMARY_SUPERADMIN_ID;
  if (!isPrivilegedUser) {
    throw new Error("FORBIDDEN_WRITE_ACCESS");
  }
  return user;
}

export async function saveShiftAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "");
  const startTimeRaw = String(formData.get("start_time") || "");
  const endTimeRaw = String(formData.get("end_time") || "");
  const startTime = normalizeTimeInput(startTimeRaw);
  const endTime = normalizeTimeInput(endTimeRaw);
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();
  if (!startTimeRaw.trim() || !endTimeRaw.trim()) {
    const { data: existingShift } = await sb
      .from("dienstplan_shifts")
      .select("start_time, end_time, comment, covers_projektion")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate)
      .maybeSingle();
    await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);
    if (existingShift?.start_time && existingShift.end_time) {
      await reopenSlotForDeletedShift(sb, {
        slotDate: shiftDate,
        startTime: existingShift.start_time,
        endTime: existingShift.end_time,
        note: existingShift.comment ?? null,
        previousEmployeeId: employeeId,
      });
      if (existingShift.covers_projektion) {
        await reopenProjektionSlot(sb, {
          slotDate: shiftDate,
          startTime: existingShift.start_time,
          endTime: existingShift.end_time,
        });
      }
    }
    await auditDienstplan(actor, "dienstplan_shift_delete", { employeeId, date: shiftDate });
    revalidatePath(PLAN_PATH);
    return;
  }
  if (!startTime || !endTime) {
    throw new Error("INVALID_SHIFT_TIME");
  }

  const breakMinutesRaw = formData.get("break_minutes");
  const breakMinutes = breakMinutesRaw !== null && breakMinutesRaw !== "" ? Number(breakMinutesRaw) : null;
  const comment = formData.get("comment") ? String(formData.get("comment")) : null;

  // Vor dem Anlegen: prüfen, ob es einen passenden offenen Slot mit dezidierter Position gibt
  const { data: matchingSlotRaw } = await sb
    .from("dienstplan_planned_slots")
    .select(await plannedSlotColumns(sb, "position"))
    .eq("slot_date", shiftDate)
    .eq("start_time", startTime)
    .eq("end_time", endTime)
    .is("assigned_employee_id", null)
    .limit(1)
    .maybeSingle();
  const matchingSlot = matchingSlotRaw as unknown as { position: string | null; require_leader?: boolean } | null;

  await assertEmployeeAllowedForShift(
    sb,
    employeeId,
    matchingSlot?.position ?? null,
    slotRequiresLeader(matchingSlot?.position ?? null, matchingSlot?.require_leader)
  );

  const { data: employeeRow } = await sb
    .from("dienstplan_employees")
    .select("can_double_as_projektion, position_category, position")
    .eq("id", employeeId)
    .maybeSingle();
  const coversProjektion = employeeRow?.can_double_as_projektion === true && formData.get("covers_projektion") === "true";

  const { data: existingShift } = await sb
    .from("dienstplan_shifts")
    .select("raw_input, covers_projektion")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();

  // Serviceleitung auf einer Projektionsschicht: automatisch kommentieren (nur bei neuen Schichten ohne eigenen Kommentar)
  const slotPosition = matchingSlot?.position ?? null;
  const serviceInProjektion = isServiceleitungInProjektion(employeeRow, slotPosition);
  const finalComment = comment ?? (!existingShift && serviceInProjektion ? SERVICELEITUNG_IN_PROJEKTION_NOTE : null);

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      comment: finalComment,
      raw_input: existingShift?.raw_input ?? null,
      covers_projektion: coversProjektion,
      ...(slotPosition && (await hasShiftPositionColumn(sb)) ? { position: slotPosition } : {}),
    },
    { onConflict: "employee_id,shift_date" }
  );

  await consumeMatchingPlannedSlot(sb, shiftDate, startTime, endTime);
  if (coversProjektion && !existingShift?.covers_projektion) {
    await consumeProjektionSlot(sb, { slotDate: shiftDate, startTime, endTime });
  } else if (!coversProjektion && existingShift?.covers_projektion) {
    await reopenProjektionSlot(sb, { slotDate: shiftDate, startTime, endTime });
  }

  await auditDienstplan(actor, "dienstplan_shift_save", {
    employeeId,
    date: shiftDate,
    start: startTime,
    end: endTime,
    mode: existingShift ? "update" : "create",
    coversProjektion,
  });

  revalidatePath(PLAN_PATH);
}

export async function bulkSaveShiftsAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const sb = createAdminClient();
  const entries = Array.from(formData.entries());
  const shiftEntries = new Map<string, { employeeId: number; date: string; startTimeRaw: string; endTimeRaw: string }>();

  for (const [key, rawValue] of entries) {
    if (!key.startsWith("shift:")) continue;
    const [, employeeIdStr, date, field] = key.split(":");
    const employeeId = Number(employeeIdStr);
    if (!employeeId || !date || (field !== "start" && field !== "end")) continue;
    const value = String(rawValue || "").trim();
    const entryKey = `${employeeId}-${date}`;
    const entry = shiftEntries.get(entryKey) ?? { employeeId, date, startTimeRaw: "", endTimeRaw: "" };
    if (field === "start") {
      entry.startTimeRaw = value;
    }
    if (field === "end") {
      entry.endTimeRaw = value;
    }
    shiftEntries.set(entryKey, entry);
  }

  let savedCount = 0;
  let deletedCount = 0;
  for (const entry of shiftEntries.values()) {
    if (!entry.startTimeRaw || !entry.endTimeRaw) {
      await sb.from("dienstplan_shifts").delete().eq("employee_id", entry.employeeId).eq("shift_date", entry.date);
      deletedCount += 1;
      continue;
    }
    const startTime = normalizeTimeInput(entry.startTimeRaw);
    const endTime = normalizeTimeInput(entry.endTimeRaw);
    if (!startTime || !endTime) {
      throw new Error(`INVALID_SHIFT_TIME_FOR_${entry.employeeId}_${entry.date}`);
    }

    const { data: existingShift } = await sb
      .from("dienstplan_shifts")
      .select("break_minutes, comment, raw_input")
      .eq("employee_id", entry.employeeId)
      .eq("shift_date", entry.date)
      .maybeSingle();

    await sb.from("dienstplan_shifts").upsert(
      {
        employee_id: entry.employeeId,
        shift_date: entry.date,
        start_time: startTime,
        end_time: endTime,
        break_minutes: existingShift?.break_minutes ?? null,
        comment: existingShift?.comment ?? null,
        raw_input: existingShift?.raw_input ?? null,
      },
      { onConflict: "employee_id,shift_date" }
    );

    await consumeMatchingPlannedSlot(sb, entry.date, startTime, endTime);
    savedCount += 1;
  }

  await auditDienstplan(actor, "dienstplan_shift_save", {
    bulk: true,
    saved: savedCount,
    deleted: deletedCount,
    count: savedCount + deletedCount,
  });

  revalidatePath(PLAN_PATH);
}

export async function clearMonthAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_shifts")
    .delete()
    .gte("shift_date", range.start)
    .lte("shift_date", range.end);

  await auditDienstplan(actor, "dienstplan_month_clear", { month });

  revalidatePath(PLAN_PATH);
}

export async function saveEmploymentHourDefaultAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const employmentType = String(formData.get("employment_type") || "").trim();
  const vacationHoursRaw = String(formData.get("vacation_hours_per_day") || "0").trim().replace(",", ".");
  const vacationHours = Number(vacationHoursRaw);
  if (!employmentType || !Number.isFinite(vacationHours) || vacationHours < 0 || vacationHours > 24) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_employment_hour_defaults")
    .upsert(
      {
        employment_type: employmentType,
        vacation_hours_per_day: vacationHours,
      },
      { onConflict: "employment_type" }
    );

  await auditDienstplan(actor, "dienstplan_settings_update", {
    setting: "Urlaubsstunden pro Tag",
    employmentType,
    vacationHours,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function savePlanningRulesAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const rules = normalizePlanningRules({
    max_shifts_per_week: String(formData.get("max_shifts_per_week") ?? "").replace(",", "."),
    min_rest_hours: String(formData.get("min_rest_hours") ?? "").replace(",", "."),
    max_consecutive_days: String(formData.get("max_consecutive_days") ?? "").replace(",", "."),
  });

  const sb = createAdminClient();
  const { error } = await sb
    .from("dienstplan_planning_rules")
    .upsert({ id: true, ...rules, updated_at: new Date().toISOString(), updated_by: actor.id }, { onConflict: "id" });
  if (error) {
    throw new Error(`Planungsregeln konnten nicht gespeichert werden: ${error.message}`);
  }

  await auditDienstplan(actor, "dienstplan_settings_update", { setting: "Planungsregeln", ...rules });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}

export async function clearMonthAvailabilityAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_availability")
    .delete()
    .gte("availability_date", range.start)
    .lte("availability_date", range.end);

  await auditDienstplan(actor, "dienstplan_availability_clear", { month });

  revalidatePath(PLAN_PATH);
  revalidatePath("/tools/dienstplaner/verfuegbarkeit");
}

/**
 * Schaltet für einen einzelnen Benutzer die Bearbeitungsrechte für
 * Verfügbarkeiten im Dienstplaner frei/zurück. Admin-only — betrifft nur
 * Nicht-Admin-Benutzer, Admins dürfen ohnehin immer bearbeiten.
 */
export async function setDienstplanEditorAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const userId = String(formData.get("user_id") || "").trim();
  const enabled = formData.get("enabled") === "true";
  if (!userId) return;

  const sb = createAdminClient();
  if (enabled) {
    await sb
      .from("dienstplan_editors")
      .upsert({ user_id: userId, granted_by: actor.id }, { onConflict: "user_id" });
  } else {
    await sb.from("dienstplan_editors").delete().eq("user_id", userId);
  }

  await auditDienstplan(actor, "dienstplan_settings_update", {
    setting: "Bearbeitungsrechte Verfügbarkeiten",
    userId,
    enabled,
  });

  revalidatePath(SETTINGS_PATH);
}

export async function moveShiftAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const fromEmployeeId = Number(formData.get("from_employee_id"));
  const toEmployeeId = Number(formData.get("to_employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  if (!fromEmployeeId || !toEmployeeId || !shiftDate || fromEmployeeId === toEmployeeId) {
    throw new Error("Ungültige Verschiebung.");
  }

  const sb = createAdminClient();
  const hasPosition = await hasShiftPositionColumn(sb);
  const { data: sourceRaw } = await sb
    .from("dienstplan_shifts")
    .select(hasPosition ? "start_time, end_time, raw_input, break_minutes, comment, position" : "start_time, end_time, raw_input, break_minutes, comment")
    .eq("employee_id", fromEmployeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();
  const sourceShift = sourceRaw as unknown as {
    start_time: string | null;
    end_time: string | null;
    raw_input: string | null;
    break_minutes: number | null;
    comment: string | null;
    position?: string | null;
  } | null;
  if (!sourceShift?.start_time || !sourceShift.end_time) {
    throw new Error("Quelle der Schicht nicht gefunden.");
  }

  // Automatischen Kommentar „Serviceleitung in Projektion“ an die neue Person anpassen
  const { data: targetEmployee } = await sb
    .from("dienstplan_employees")
    .select("position_category, position")
    .eq("id", toEmployeeId)
    .maybeSingle();
  const targetIsServiceInProjektion = isServiceleitungInProjektion(targetEmployee, sourceShift.position ?? null);
  let movedComment = sourceShift.comment ?? null;
  if (movedComment === SERVICELEITUNG_IN_PROJEKTION_NOTE && !targetIsServiceInProjektion) movedComment = null;
  if (!movedComment && targetIsServiceInProjektion) movedComment = SERVICELEITUNG_IN_PROJEKTION_NOTE;

  const { error: insertError } = await sb.from("dienstplan_shifts").insert({
    employee_id: toEmployeeId,
    shift_date: shiftDate,
    start_time: sourceShift.start_time,
    end_time: sourceShift.end_time,
    break_minutes: sourceShift.break_minutes ?? null,
    comment: movedComment,
    raw_input: sourceShift.raw_input ?? "drag-drop",
    ...(hasPosition && sourceShift.position ? { position: sourceShift.position } : {}),
  });
  if (insertError) {
    throw new Error("Ziel hat bereits eine Schicht oder die Verschiebung ist fehlgeschlagen.");
  }

  const { error: deleteError } = await sb
    .from("dienstplan_shifts")
    .delete()
    .eq("employee_id", fromEmployeeId)
    .eq("shift_date", shiftDate);
  if (deleteError) {
    await sb.from("dienstplan_shifts").delete().eq("employee_id", toEmployeeId).eq("shift_date", shiftDate);
    throw new Error("Verschiebung konnte nicht abgeschlossen werden.");
  }

  await auditDienstplan(actor, "dienstplan_shift_move", {
    fromEmployeeId,
    toEmployeeId,
    date: shiftDate,
  });

  revalidatePath(PLAN_PATH);
}

export async function copyWeekShiftsAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const fromWeekStart = String(formData.get("from_week_start") || "").trim();
  const toWeekStart = String(formData.get("to_week_start") || "").trim();
  if (!fromWeekStart || !toWeekStart) return;

  const fromWeekEnd = addDays(fromWeekStart, 6);
  const toWeekEnd = addDays(toWeekStart, 6);
  if (!fromWeekEnd || !toWeekEnd) return;

  const sb = createAdminClient();
  const { data: sourceWeekShifts, error: sourceWeekError } = await sb
    .from("dienstplan_shifts")
    .select("employee_id, shift_date, start_time, end_time, break_minutes, comment, raw_input")
    .gte("shift_date", fromWeekStart)
    .lte("shift_date", fromWeekEnd);
  if (sourceWeekError) {
    throw new Error(`COPY_WEEK_SOURCE_FETCH_FAILED: ${sourceWeekError.message}`);
  }

  const sourceShifts = sourceWeekShifts ?? [];
  const { error: deleteTargetWeekError } = await sb
    .from("dienstplan_shifts")
    .delete()
    .gte("shift_date", toWeekStart)
    .lte("shift_date", toWeekEnd);
  if (deleteTargetWeekError) {
    throw new Error(`COPY_WEEK_TARGET_DELETE_FAILED: ${deleteTargetWeekError.message}`);
  }

  let copiedCount = 0;
  if (sourceShifts.length > 0) {
    const entriesToInsert = sourceShifts
      .map((shift) => {
        const fromDate = new Date(`${shift.shift_date}T00:00:00Z`);
        const targetDate = new Date(fromDate);
        targetDate.setUTCDate(targetDate.getUTCDate() + 7);
        const nextDate = targetDate.toISOString().slice(0, 10);
        if (nextDate < toWeekStart || nextDate > toWeekEnd) return null;
        return {
          employee_id: shift.employee_id,
          shift_date: nextDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes,
          comment: shift.comment,
          raw_input: "week-copy",
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (entriesToInsert.length > 0) {
      const { error: insertCopiedShiftsError } = await sb.from("dienstplan_shifts").insert(entriesToInsert);
      if (insertCopiedShiftsError) {
        throw new Error(`COPY_WEEK_TARGET_INSERT_FAILED: ${insertCopiedShiftsError.message}`);
      }
      copiedCount = entriesToInsert.length;
    }
  }

  await auditDienstplan(actor, "dienstplan_week_copy", {
    fromWeekStart,
    toWeekStart,
    count: copiedCount,
  });

  revalidatePath(PLAN_PATH);
}

export async function updateShiftDetailsAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  const breakMinutesRaw = String(formData.get("break_minutes") || "").trim();
  const comment = String(formData.get("comment") || "").trim();
  if (!employeeId || !shiftDate || !startTime || !endTime) {
    throw new Error("INVALID_SHIFT_DETAILS");
  }

  const breakMinutes = breakMinutesRaw ? Number(breakMinutesRaw) : null;
  const normalizedBreakMinutes = Number.isFinite(breakMinutes) && (breakMinutes ?? 0) >= 0 ? breakMinutes : null;

  const sb = createAdminClient();
  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: normalizedBreakMinutes,
      comment: comment || null,
      raw_input: "manual-details",
    },
    { onConflict: "employee_id,shift_date" }
  );

  await consumeMatchingPlannedSlot(sb, shiftDate, startTime, endTime);

  await auditDienstplan(actor, "dienstplan_shift_update", {
    employeeId,
    date: shiftDate,
    start: startTime,
    end: endTime,
  });

  revalidatePath(PLAN_PATH);
}

async function isCallerDienstplanAdmin() {
  const user = await currentUser();
  if (!user) return false;
  const role = getRoleFromPublicMetadata(user.publicMetadata);
  return role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;
}

function extractAllowedPositions(formData: FormData): PositionCategory[] {
  const raw = formData.getAll("allowed_positions");
  return normalizeAllowedPositions(raw);
}

/**
 * Prüft, ob die gegebene Schicht für den Mitarbeiter erlaubt ist.
 * Wirft POSITION_NOT_ALLOWED:<empName>:<category>, wenn der Mitarbeiter
 * für die abgeleitete Position nicht freigeschaltet ist.
 * slotPosition wird bevorzugt; fällt auf die Mitarbeiter-Position zurück.
 */
async function assertEmployeeAllowedForShift(
  sb: ReturnType<typeof createAdminClient>,
  employeeId: number,
  slotPosition?: string | null,
  requireLeader = false
) {
  const { data: emp } = await sb
    .from("dienstplan_employees")
    .select("name, allowed_positions, position_category, position")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return;
  const allowed = normalizeAllowedPositions(emp.allowed_positions);
  const category =
    inferPositionCategory(slotPosition) ??
    (emp.position_category as PositionCategory | null | undefined) ??
    inferPositionCategory(emp.position);
  if (!category) return;
  if (allowed.length === 0 || !isAllowedForCategory(allowed, category, requireLeader)) {
    throw new Error(`POSITION_NOT_ALLOWED:${emp.name}:${requireLeader && category === "projektion" ? "projektionsleitung" : category}`);
  }
}

export async function createEmployeeAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const callerIsAdmin = await isCallerDienstplanAdmin();

  const name = String(formData.get("name") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const employmentType = String(formData.get("employment_type") || "vollzeit").trim();
  const monthlyHours = Number(formData.get("monthly_hours") || 0);
  const weeklyHours = Number(formData.get("weekly_hours") || 0);
  const color = String(formData.get("color") || "#6366f1").trim();
  const rawPositionCategory = String(formData.get("position_category") || "").trim();
  const positionCategory =
    rawPositionCategory === "serviceleitung" ||
    rawPositionCategory === "projektionsleitung" ||
    rawPositionCategory === "projektion"
      ? rawPositionCategory
      : null;
  const rawUserId = String(formData.get("user_id") || "").trim();
  const userId = callerIsAdmin && rawUserId ? rawUserId : null;
  const allowedPositions = extractAllowedPositions(formData);
  const canDoubleAsProjektion = formData.get("can_double_as_projektion") === "true";
  if (!name) return;

  const sb = createAdminClient();

  if (userId) {
    const { data: existing } = await sb
      .from("dienstplan_employees")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new Error("USER_ALREADY_ASSIGNED");
    }
  }

  const { data: lastEmployee } = await sb
    .from("dienstplan_employees")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (lastEmployee?.sort_order ?? -1) + 1;

  await sb.from("dienstplan_employees").insert({
    name,
    position: position || null,
    department: department || null,
    employment_type: employmentType,
    monthly_hours: monthlyHours,
    weekly_hours: weeklyHours,
    color,
    sort_order: nextSortOrder,
    is_active: true,
    position_category: positionCategory,
    allowed_positions:
      allowedPositions.length > 0
        ? allowedPositions
        : (["serviceleitung", "projektionsleitung", "projektion"] as PositionCategory[]),
    user_id: userId,
    can_double_as_projektion: canDoubleAsProjektion,
  });

  await auditDienstplan(actor, "dienstplan_employee_create", { name });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updateEmployeeAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const callerIsAdmin = await isCallerDienstplanAdmin();

  const id = Number(formData.get("id"));
  if (!id) return;

  const updates: Record<string, unknown> = {};

  const rawName = formData.get("name");
  if (typeof rawName === "string") {
    const value = rawName.trim();
    if (!value) return;
    updates.name = value;
  }
  const rawPosition = formData.get("position");
  if (typeof rawPosition === "string") updates.position = rawPosition.trim() || null;

  const rawDepartment = formData.get("department");
  if (typeof rawDepartment === "string") updates.department = rawDepartment.trim() || null;

  const rawEmploymentType = formData.get("employment_type");
  if (typeof rawEmploymentType === "string" && rawEmploymentType.trim()) {
    updates.employment_type = rawEmploymentType.trim();
  }
  const rawMonthlyHours = formData.get("monthly_hours");
  if (typeof rawMonthlyHours === "string") updates.monthly_hours = Number(rawMonthlyHours || 0);

  const rawWeeklyHours = formData.get("weekly_hours");
  if (typeof rawWeeklyHours === "string") updates.weekly_hours = Number(rawWeeklyHours || 0);

  const rawColor = formData.get("color");
  if (typeof rawColor === "string" && rawColor.trim()) updates.color = rawColor.trim();

  const rawIsActive = formData.get("is_active");
  if (rawIsActive !== null) updates.is_active = rawIsActive === "true";

  const rawPositionCategory = formData.get("position_category");
  if (typeof rawPositionCategory === "string") {
    const value = rawPositionCategory.trim();
    if (!value) {
      updates.position_category = null;
    } else if (
      value === "serviceleitung" ||
      value === "projektionsleitung" ||
      value === "projektion"
    ) {
      updates.position_category = value;
    }
  }

  if (callerIsAdmin) {
    const rawUserId = formData.get("user_id");
    if (typeof rawUserId === "string") {
      const value = rawUserId.trim();
      updates.user_id = value || null;
    }
  }

  if (formData.has("allowed_positions")) {
    updates.allowed_positions = extractAllowedPositions(formData);
  }

  if (formData.has("can_double_as_projektion")) {
    updates.can_double_as_projektion = formData.get("can_double_as_projektion") === "true";
  }

  if (Object.keys(updates).length === 0) return;

  const sb = createAdminClient();

  if (typeof updates.user_id === "string" && updates.user_id) {
    const { data: existing } = await sb
      .from("dienstplan_employees")
      .select("id")
      .eq("user_id", updates.user_id)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new Error("USER_ALREADY_ASSIGNED");
    }
  }

  await sb.from("dienstplan_employees").update(updates).eq("id", id);

  await auditDienstplan(actor, "dienstplan_employee_update", {
    employeeId: id,
    employeeName: typeof updates.name === "string" ? updates.name : null,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteEmployeeAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  const { data: existingEmployee } = await sb
    .from("dienstplan_employees")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  await sb.from("dienstplan_employees").delete().eq("id", id);

  await auditDienstplan(actor, "dienstplan_employee_delete", {
    employeeId: id,
    employeeName: existingEmployee?.name ?? null,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteShiftAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();

  // Zuerst die Schicht laden, damit wir nach dem Löschen einen offenen Slot anlegen können.
  const { data: existingShift } = await sb
    .from("dienstplan_shifts")
    .select("start_time, end_time, comment, covers_projektion")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();

  await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);

  if (existingShift?.start_time && existingShift.end_time) {
    await reopenSlotForDeletedShift(sb, {
      slotDate: shiftDate,
      startTime: existingShift.start_time,
      endTime: existingShift.end_time,
      note: existingShift.comment ?? null,
      previousEmployeeId: employeeId,
    });
    if (existingShift.covers_projektion) {
      await reopenProjektionSlot(sb, {
        slotDate: shiftDate,
        startTime: existingShift.start_time,
        endTime: existingShift.end_time,
      });
    }
  }

  await auditDienstplan(actor, "dienstplan_shift_delete", { employeeId, date: shiftDate });

  revalidatePath(PLAN_PATH);
}

/**
 * Stellt sicher, dass für einen entfernten Schicht-Zeitraum wieder ein offener
 * planned_slot existiert. Reaktiviert einen evtl. dem Mitarbeiter zugewiesenen
 * Slot oder legt einen neuen unbesetzten Slot an, wenn kein passender vorhanden ist.
 */
async function reopenSlotForDeletedShift(
  sb: ReturnType<typeof createAdminClient>,
  args: {
    slotDate: string;
    startTime: string;
    endTime: string;
    note: string | null;
    previousEmployeeId: number;
  }
) {
  const startKey = args.startTime.slice(0, 5);
  const endKey = args.endTime.slice(0, 5);

  // 1) Falls dem gelöschten Mitarbeiter ein Slot zugewiesen war: Zuweisung lösen.
  const { data: assignedSlot } = await sb
    .from("dienstplan_planned_slots")
    .select("id")
    .eq("slot_date", args.slotDate)
    .eq("assigned_employee_id", args.previousEmployeeId)
    .gte("start_time", `${startKey}:00`)
    .lte("start_time", `${startKey}:59`)
    .limit(1)
    .maybeSingle();
  if (assignedSlot) {
    await sb
      .from("dienstplan_planned_slots")
      .update({ assigned_employee_id: null })
      .eq("id", assignedSlot.id);
    return;
  }

  // 2) Sonst prüfen, ob bereits ein passender offener Slot existiert.
  const { data: openSlot } = await sb
    .from("dienstplan_planned_slots")
    .select("id, start_time, end_time")
    .eq("slot_date", args.slotDate)
    .is("assigned_employee_id", null);

  const matching = (openSlot ?? []).find(
    (s) => s.start_time?.slice(0, 5) === startKey && s.end_time?.slice(0, 5) === endKey
  );
  if (matching) return;

  // 3) Neuen offenen Slot anlegen.
  await sb.from("dienstplan_planned_slots").insert({
    slot_date: args.slotDate,
    position: null,
    track_key: null,
    start_time: args.startTime,
    end_time: args.endTime,
    note: args.note,
    source: "reopened-after-delete",
  });
}

export async function createPauseRuleAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const minMinutes = Number(formData.get("min_minutes") || 0);
  const pauseMinutes = Number(formData.get("pause_minutes") || 0);
  if (minMinutes <= 0 || pauseMinutes <= 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").insert({ min_minutes: minMinutes, pause_minutes: pauseMinutes });

  await auditDienstplan(actor, "dienstplan_pause_rule_save", { mode: "create", minMinutes, pauseMinutes });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updatePauseRuleAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const minMinutes = Number(formData.get("min_minutes") || 0);
  const pauseMinutes = Number(formData.get("pause_minutes") || 0);
  if (!id || minMinutes <= 0 || pauseMinutes <= 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").update({ min_minutes: minMinutes, pause_minutes: pauseMinutes }).eq("id", id);

  await auditDienstplan(actor, "dienstplan_pause_rule_save", { mode: "update", minMinutes, pauseMinutes });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deletePauseRuleAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").delete().eq("id", id);

  await auditDienstplan(actor, "dienstplan_pause_rule_delete", { id });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function saveAvailabilityAction(formData: FormData) {
  const actor = await assertDienstplanAvailabilityWrite();

  const employeeId = Number(formData.get("employee_id"));
  const availabilityDate = String(formData.get("availability_date") || "");
  const status = String(formData.get("status") || "").trim();
  const fixedStart = normalizeTimeInput(String(formData.get("fixed_start") || ""));
  const fixedEnd = normalizeTimeInput(String(formData.get("fixed_end") || ""));
  if (!employeeId || !availabilityDate) return;

  const sb = createAdminClient();
  const normalizedStatus = status || null;
  const normalizedStart = status === "fix" && fixedStart ? fixedStart : null;
  const normalizedEnd = status === "fix" && fixedEnd ? fixedEnd : null;
  if (status === "fix" && (!normalizedStart || !normalizedEnd)) {
    throw new Error("INVALID_AVAILABILITY_TIME");
  }

  if (!normalizedStatus && !normalizedStart && !normalizedEnd) {
    await sb.from("dienstplan_availability").delete().eq("employee_id", employeeId).eq("availability_date", availabilityDate);
    await auditDienstplan(actor, "dienstplan_availability_save", {
      employeeId,
      date: availabilityDate,
      status: "geleert",
    });
    revalidatePath(PLAN_PATH);
    return;
  }

  await sb.from("dienstplan_availability").upsert(
    {
      employee_id: employeeId,
      availability_date: availabilityDate,
      status: normalizedStatus,
      fixed_start: normalizedStart,
      fixed_end: normalizedEnd,
    },
    { onConflict: "employee_id,availability_date" }
  );

  await auditDienstplan(actor, "dienstplan_availability_save", {
    employeeId,
    date: availabilityDate,
    status: normalizedStatus,
  });

  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// Sonderveranstaltungen
// ──────────────────────────────────────────────────────────────────────

export async function createSpecialEventAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const eventDate = String(formData.get("event_date") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  const note = String(formData.get("note") || "").trim();
  if (!eventDate || !title) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_special_events").insert({
    event_date: eventDate,
    title,
    position: position || null,
    start_time: startTime,
    end_time: endTime,
    note: note || null,
  });

  await auditDienstplan(actor, "dienstplan_special_event_save", {
    mode: "create",
    title,
    date: eventDate,
  });

  revalidatePath(PLAN_PATH);
}

export async function updateSpecialEventAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const title = String(formData.get("title") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  const note = String(formData.get("note") || "").trim();
  if (!id || !title) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_special_events")
    .update({
      title,
      position: position || null,
      start_time: startTime,
      end_time: endTime,
      note: note || null,
    })
    .eq("id", id);

  await auditDienstplan(actor, "dienstplan_special_event_save", {
    mode: "update",
    title,
    id,
  });

  revalidatePath(PLAN_PATH);
}

export async function deleteSpecialEventAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  const { data: existingEvent } = await sb
    .from("dienstplan_special_events")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  await sb.from("dienstplan_special_events").delete().eq("id", id);

  await auditDienstplan(actor, "dienstplan_special_event_delete", {
    id,
    title: existingEvent?.title ?? null,
  });

  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// Vorplanung – geplante (ggf. unbesetzte) Slots
// ──────────────────────────────────────────────────────────────────────

export async function createPlannedSlotAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const slotDate = String(formData.get("slot_date") || "").trim();
  const kind = String(formData.get("position_kind") || "").trim();
  const resolved = kind
    ? resolvePositionKind(kind, String(formData.get("position_custom") || ""))
    : null;
  const position = resolved?.position ?? String(formData.get("position") || "").trim();
  const requireLeader = resolved?.require_leader ?? false;
  const trackKey = String(formData.get("track_key") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  const note = String(formData.get("note") || "").trim();
  if (!slotDate || !startTime || !endTime) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_planned_slots").insert({
    slot_date: slotDate,
    position: position || null,
    track_key: trackKey || null,
    start_time: startTime,
    end_time: endTime,
    note: note || null,
    source: "manual",
    ...(requireLeader ? { require_leader: true } : {}),
  });

  await auditDienstplan(actor, "dienstplan_planned_slot_create", {
    date: slotDate,
    start: startTime,
    end: endTime,
    position: position || null,
  });

  revalidatePath(PLAN_PATH);
}

export async function deletePlannedSlotAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_planned_slots").delete().eq("id", id);

  await auditDienstplan(actor, "dienstplan_planned_slot_delete", { id });

  revalidatePath(PLAN_PATH);
}

export async function assignPlannedSlotAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const employeeId = Number(formData.get("employee_id"));
  if (!id || !employeeId) return;

  const sb = createAdminClient();
  const { data: slotRaw } = await sb
    .from("dienstplan_planned_slots")
    .select(await plannedSlotColumns(sb, "id, slot_date, start_time, end_time, note, position"))
    .eq("id", id)
    .maybeSingle();
  const slot = slotRaw as unknown as {
    id: number;
    slot_date: string;
    start_time: string;
    end_time: string;
    note: string | null;
    position: string | null;
    require_leader?: boolean;
  } | null;
  if (!slot) return;

  await assertEmployeeAllowedForShift(sb, employeeId, slot.position ?? null, slotRequiresLeader(slot.position, slot.require_leader));

  const { data: assignee } = await sb
    .from("dienstplan_employees")
    .select("position_category, position")
    .eq("id", employeeId)
    .maybeSingle();
  const serviceInProjektion = isServiceleitungInProjektion(assignee, slot.position);

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      break_minutes: null,
      comment: slot.note ?? (serviceInProjektion ? SERVICELEITUNG_IN_PROJEKTION_NOTE : null),
      raw_input: "from-planned-slot",
      ...(slot.position && (await hasShiftPositionColumn(sb)) ? { position: slot.position } : {}),
    },
    { onConflict: "employee_id,shift_date" }
  );

  await sb.from("dienstplan_planned_slots").delete().eq("id", id);

  await auditDienstplan(actor, "dienstplan_planned_slot_assign", {
    employeeId,
    date: slot.slot_date,
  });

  revalidatePath(PLAN_PATH);
}

type PlannerEmployeeRow = {
  id: number;
  name: string;
  position: string | null;
  position_category: string | null;
  employment_type: string;
  monthly_hours: number;
  weekly_hours: number;
  allowed_positions: PositionCategory[] | null;
};

/**
 * Lädt aktive Mitarbeitende inkl. Freischaltungen. Fehlt die Spalte
 * allowed_positions (alte DB), gilt "keine Einschränkung" (null) statt
 * "für nichts freigeschaltet".
 */
async function loadPlannerEmployees(sb: ReturnType<typeof createAdminClient>): Promise<PlannerEmployeeRow[]> {
  const base = "id, name, position, position_category, employment_type, monthly_hours, weekly_hours";
  const full = await sb.from("dienstplan_employees").select(`${base}, allowed_positions`).eq("is_active", true);
  const rows = (full.error
    ? (await sb.from("dienstplan_employees").select(base).eq("is_active", true)).data
    : full.data) as
    | (Omit<PlannerEmployeeRow, "allowed_positions"> & { allowed_positions?: string[] | null })[]
    | null;
  return (rows ?? []).map((row) => ({
    ...row,
    allowed_positions: Array.isArray(row.allowed_positions) ? normalizeAllowedPositions(row.allowed_positions) : null,
  }));
}

export type AutoFillAiSummary = {
  /** Wie oft die KI befragt wurde */
  rounds: number;
  /** In wie vielen Runden Vorschläge übernommen wurden */
  applied: number;
  /** Anzahl Slots, die die KI anders besetzt hat als der Algorithmus */
  changed: number;
  scoreBefore: number;
  scoreAfter: number;
  notes: string[];
  error?: string;
};

function readNumberOption(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const raw = formData.get(key);
  const value = raw === null || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export async function autoFillPlannedSlotsAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  const slotColumns = await plannedSlotColumns(sb, "id, slot_date, position, start_time, end_time");
  // Admin-Einstellungen sind der Standard; der Dialog im Monatsplan kann sie pro Lauf überschreiben
  const rules = await loadPlanningRules(sb);
  const maxShiftsPerWeek = readNumberOption(formData, "max_shifts_per_week", rules.max_shifts_per_week, 1, 7);
  const minRestMinutes = readNumberOption(formData, "min_rest_hours", rules.min_rest_hours, 0, 24) * 60;
  const maxConsecutiveDays = readNumberOption(formData, "max_consecutive_days", rules.max_consecutive_days, 1, 14);

  const [
    employeesResult,
    slotsResult,
    availabilityResult,
    pauseRulesResult,
    existingShiftsResult,
    hourDefaultsResult,
    prevEdgeResult,
    nextEdgeResult,
  ] = await Promise.all([
    loadPlannerEmployees(sb),
    sb
      .from("dienstplan_planned_slots")
      .select(slotColumns)
      .is("assigned_employee_id", null)
      .gte("slot_date", range.start)
      .lte("slot_date", range.end)
      .order("slot_date"),
    sb
      .from("dienstplan_availability")
      .select("employee_id, availability_date, status, fixed_start, fixed_end")
      .gte("availability_date", range.start)
      .lte("availability_date", range.end),
    sb.from("dienstplan_pause_rules").select("min_minutes, pause_minutes").order("min_minutes"),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end),
    sb.from("dienstplan_employment_hour_defaults").select("employment_type, vacation_hours_per_day"),
    // Randtage der Nachbarmonate: wichtig für Ruhezeit und Tage in Folge am Monatswechsel
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", addDays(range.start, -7) ?? range.start)
      .lt("shift_date", range.start),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gt("shift_date", range.end)
      .lte("shift_date", addDays(range.end, 7) ?? range.end),
  ]);

  const employees = employeesResult;
  const slots = (slotsResult.data ?? []) as unknown as {
    id: number;
    slot_date: string;
    position: string | null;
    start_time: string;
    end_time: string;
    require_leader?: boolean;
  }[];
  const availability = (availabilityResult.data ?? []) as {
    employee_id: number;
    availability_date: string;
    status: string | null;
    fixed_start: string | null;
    fixed_end: string | null;
  }[];
  const pauseRules = (pauseRulesResult.data ?? []) as PauseRule[];
  const existingShifts = (existingShiftsResult.data ?? []) as {
    employee_id: number;
    shift_date: string;
    start_time: string | null;
    end_time: string | null;
  }[];
  const hourDefaults = (hourDefaultsResult.data ?? []) as {
    employment_type: string;
    vacation_hours_per_day: number;
  }[];
  const edgeShifts = [...(prevEdgeResult.data ?? []), ...(nextEdgeResult.data ?? [])] as typeof existingShifts;

  const extraMinutesByEmployee = calculateUrlaubMinutesByEmployee(
    availability.map((a) => ({ employee_id: a.employee_id, status: a.status })),
    employees.map((e) => ({ id: e.id, employment_type: e.employment_type })),
    hourDefaults
  );

  const planParams = {
    employees,
    existingShifts: [...existingShifts, ...edgeShifts.map((shift) => ({ ...shift, context: true }))],
    availability,
    slots: slots.map((slot) => ({
      id: slot.id,
      shift_date: slot.slot_date,
      position: slot.position,
      require_leader: slotRequiresLeader(slot.position, slot.require_leader),
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
    })),
    pauseRules,
    maxShiftsPerWeek,
    minRestMinutes,
    maxConsecutiveDays,
    extraMonthlyMinutesByEmployee: extraMinutesByEmployee,
  };

  // Schritt 1: Algorithmus plant regelbasiert. Schritt 2 (optional): KI prüft und verbessert in Runden;
  // jede Änderung wird gegen die harten Regeln geprüft und nur bei besserer Planqualität übernommen.
  const useAi = formData.get("use_ai") === "true" && dienstplanAiEnabled() && slots.length > 0;
  const aiRounds = readNumberOption(formData, "ai_rounds", 3, 1, 5);

  let generated: AutoPlanResult["plannedShifts"];
  let unfilledSlots: AutoPlanResult["unfilledSlots"];
  let changedBySlot = new Set<number>();
  let aiSummary: AutoFillAiSummary | undefined;

  if (useAi) {
    let history: string | undefined;
    try {
      const historyResult = await sb
        .from("dienstplan_history_shifts")
        .select("shift_date, employee_name, employee_id, position, start_time, end_time, source_note")
        .order("shift_date", { ascending: false })
        .limit(4000);
      if (!historyResult.error && Array.isArray(historyResult.data) && historyResult.data.length > 0) {
        history = buildHistoryPromptBlock(computeHistoryInsights(historyResult.data as HistoryShift[]));
      }
    } catch {
      // Historie ist optional
    }

    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const baseMinutes = new Map<number, number>();
    for (const shift of existingShifts) {
      const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules);
      if (summary) baseMinutes.set(shift.employee_id, (baseMinutes.get(shift.employee_id) ?? 0) + summary.workMinutes);
    }
    for (const [employeeId, minutes] of extraMinutesByEmployee) {
      baseMinutes.set(employeeId, (baseMinutes.get(employeeId) ?? 0) + minutes);
    }

    const outcome = await improvePlanWithAi(
      planParams,
      async (request) => {
        const plannedMinutes = new Map(baseMinutes);
        for (const assignment of request.assignments) {
          const slot = slotById.get(assignment.slot_id);
          const employee = employees.find((entry) => entry.id === assignment.employee_id);
          if (!slot || !employee) continue;
          const start = slot.start_time.slice(0, 5);
          const isServiceleitung = employee.position?.trim().toLowerCase() === "serviceleitung";
          const end = isServiceleitung
            ? (addHoursToTime(start, 8) ?? slot.end_time.slice(0, 5))
            : slot.end_time.slice(0, 5);
          const summary = calculateShiftMinutes(start, end, pauseRules);
          if (summary) {
            plannedMinutes.set(employee.id, (plannedMinutes.get(employee.id) ?? 0) + summary.workMinutes);
          }
        }
        return askAiToImprovePlan({
          month,
          round: request.round,
          score: request.score,
          rules: {
            max_shifts_per_week: maxShiftsPerWeek,
            min_rest_hours: minRestMinutes / 60,
            max_consecutive_days: maxConsecutiveDays,
          },
          slots: slots.map((slot) => ({
            id: slot.id,
            date: slot.slot_date,
            weekday: new Date(`${slot.slot_date}T00:00:00Z`).getUTCDay(),
            position: slot.position,
            leader_only: slotRequiresLeader(slot.position, slot.require_leader),
            start_time: slot.start_time.slice(0, 5),
            end_time: slot.end_time.slice(0, 5),
            note: null,
          })),
          employees: employees.map((employee) => {
            const planned = Math.round(((plannedMinutes.get(employee.id) ?? 0) / 60) * 10) / 10;
            const target = Number(employee.monthly_hours) || 0;
            return {
              id: employee.id,
              name: employee.name,
              position: employee.position,
              allowed_positions: employee.allowed_positions,
              monthly_target_hours: target,
              weekly_target_hours: Number(employee.weekly_hours) || 0,
              planned_month_hours: planned,
              delta_hours: Math.round((planned - target) * 10) / 10,
            };
          }),
          availability: availability.map((entry) => ({
            employee_id: entry.employee_id,
            date: entry.availability_date,
            status: entry.status,
            fixed_start: entry.fixed_start,
            fixed_end: entry.fixed_end,
          })),
          assignments: request.assignments,
          unfilled: request.unfilled,
          history,
        });
      },
      aiRounds
    );

    generated = outcome.result.plannedShifts;
    unfilledSlots = outcome.result.unfilledSlots;
    changedBySlot = new Set(outcome.changedSlotIds);
    aiSummary = {
      rounds: outcome.roundsAsked,
      applied: outcome.roundsApplied,
      changed: outcome.changedSlotIds.length,
      scoreBefore: outcome.scoreBefore,
      scoreAfter: outcome.scoreAfter,
      notes: outcome.notes,
      error: outcome.error,
    };
  } else {
    const result = generateAutoPlanSlots(planParams);
    generated = result.plannedShifts;
    unfilledSlots = result.unfilledSlots;
  }

  if (generated.length === 0) {
    return { plannedShifts: generated, unfilledSlots, ai: aiSummary };
  }

  // Jede Zuweisung gehört über slot_id zu genau einem offenen Slot
  const filledShifts = generated.filter((shift) => typeof shift.slot_id === "number");
  const assignedSlotIds = new Set(filledShifts.map((shift) => shift.slot_id as number));

  const positionColumn = await hasShiftPositionColumn(sb);
  const slotPositionById = new Map(slots.map((slot) => [slot.id, slot.position]));
  const employeeRoleById = new Map(employees.map((employee) => [employee.id, employee]));

  const { error: upsertError } = await sb.from("dienstplan_shifts").upsert(
    filledShifts.map(({ slot_id, ...shift }) => {
      const slotPosition = slot_id !== undefined ? (slotPositionById.get(slot_id) ?? null) : null;
      return {
        ...shift,
        break_minutes: null,
        // Serviceleitung auf einer Projektionsschicht wird automatisch kommentiert
        comment: isServiceleitungInProjektion(employeeRoleById.get(shift.employee_id), slotPosition)
          ? SERVICELEITUNG_IN_PROJEKTION_NOTE
          : null,
        raw_input: slot_id !== undefined && changedBySlot.has(slot_id) ? "ai-assignment" : "auto-fill-slot",
        ...(positionColumn && slotPosition ? { position: slotPosition } : {}),
      };
    }),
    { onConflict: "employee_id,shift_date" }
  );
  if (upsertError) {
    throw new Error(`Schichten konnten nicht gespeichert werden: ${upsertError.message}`);
  }

  await sb.from("dienstplan_planned_slots").delete().in("id", Array.from(assignedSlotIds));

  await auditDienstplan(actor, "dienstplan_planned_slots_autofill", {
    month,
    filled: filledShifts.length,
    ...(aiSummary ? { ai_rounds: aiSummary.rounds, ai_changed: aiSummary.changed } : {}),
  });

  revalidatePath(PLAN_PATH);
  return { plannedShifts: generated, unfilledSlots, ai: aiSummary };
}

// ──────────────────────────────────────────────────────────────────────
// Schichtregeln (Position + Uhrzeit + Wochentage) und Tages-Anpassungen
// ──────────────────────────────────────────────────────────────────────

const RULES_MISSING_HINT =
  "Die Schichtregeln sind noch nicht eingerichtet. Bitte dienstplaner-shift-rules-migration.sql in Supabase ausführen.";

function parseWeekdays(formData: FormData) {
  const days = formData
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function parseRequirementFields(formData: FormData) {
  const resolved = resolvePositionKind(
    String(formData.get("position_kind") || ""),
    String(formData.get("position_custom") || "")
  );
  if (!resolved) throw new Error("Bitte eine Position auswählen.");
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  if (!startTime || !endTime) throw new Error("Bitte Beginn und Ende angeben.");
  if (startTime === endTime) throw new Error("Beginn und Ende dürfen nicht gleich sein.");
  const count = Math.floor(Number(formData.get("required_count") || 1));
  if (!Number.isFinite(count) || count < 1 || count > 10) throw new Error("Anzahl muss zwischen 1 und 10 liegen.");
  const note = String(formData.get("note") || "").trim();
  return { ...resolved, startTime, endTime, count, note: note || null };
}

export async function saveShiftRuleAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id") || 0);
  const periodId = Number(formData.get("period_id") || 0);
  const fields = parseRequirementFields(formData);
  const weekdays = parseWeekdays(formData);
  if (weekdays.length === 0) throw new Error("Bitte mindestens einen Wochentag auswählen.");

  const sb = createAdminClient();
  const payload = {
    position: fields.position,
    require_leader: fields.require_leader,
    start_time: fields.startTime,
    end_time: fields.endTime,
    weekdays,
    required_count: fields.count,
    note: fields.note,
    updated_at: new Date().toISOString(),
    // nur setzen, wenn gewünscht: ohne Zeitraum-Migration existiert die Spalte noch nicht
    ...(!id && periodId > 0 ? { period_id: periodId } : {}),
  };
  const result = id
    ? await sb.from("dienstplan_shift_rules").update(payload).eq("id", id)
    : await sb.from("dienstplan_shift_rules").insert(payload);
  if (result.error) throw new Error(`${RULES_MISSING_HINT} (${result.error.message})`);

  await auditDienstplan(actor, "dienstplan_requirement_save", {
    kind: "Schichtregel",
    mode: id ? "update" : "create",
    position: fields.position,
    leader: fields.require_leader,
    weekdays,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}

export async function deleteShiftRuleAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id") || 0);
  if (!id) return;

  const sb = createAdminClient();
  const { error } = await sb.from("dienstplan_shift_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await auditDienstplan(actor, "dienstplan_requirement_delete", { kind: "Schichtregel", id });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}

async function loadShiftRules(
  sb: ReturnType<typeof createAdminClient>
): Promise<{ rules: ShiftRule[]; periods: RulePeriod[] }> {
  const loaded = await loadShiftRulesAndPeriods(sb);
  if (!loaded.available) throw new Error(`${RULES_MISSING_HINT} (${loaded.error ?? "unbekannt"})`);
  return { rules: loaded.rules, periods: loaded.periods };
}

async function loadDayRequirements(
  sb: ReturnType<typeof createAdminClient>,
  start: string,
  end: string
): Promise<DayRequirement[]> {
  const { data, error } = await sb
    .from("dienstplan_position_requirements")
    .select("requirement_date, position, require_leader, start_time, end_time, required_count, note")
    .gte("requirement_date", start)
    .lte("requirement_date", end);
  if (error) throw new Error(`${RULES_MISSING_HINT} (${error.message})`);
  return ((data ?? []) as DayRequirement[]).map((row) => ({
    ...row,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
  }));
}

/**
 * Baut die offenen (roten) Slots der angegebenen Tage aus Wochenregeln, Tages-Anpassungen
 * und Sonderveranstaltungen neu auf. Manuell angelegte Slots bleiben unangetastet, bereits
 * eingetragene Schichten decken passende Slots ab. Gibt die Zahl der neuen Slots zurück.
 */
async function regenerateSlotsForDates(
  sb: ReturnType<typeof createAdminClient>,
  dates: string[],
  options: { overwrite: boolean }
): Promise<number> {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Erst laden (wirft bei fehlender Migration), dann löschen - sonst gingen Slots verloren
  const [{ rules, periods }, overrides, eventsResult, shiftsResult, hasLeaderColumn] = await Promise.all([
    loadShiftRules(sb),
    loadDayRequirements(sb, first, last),
    sb
      .from("dienstplan_special_events")
      .select("event_date, title, position, start_time, end_time, note")
      .gte("event_date", first)
      .lte("event_date", last),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", first)
      .lte("shift_date", last),
    plannedSlotColumns(sb, "id").then((columns) => columns.includes("require_leader")),
  ]);

  const events = (eventsResult.data ?? []) as {
    event_date: string;
    title: string;
    position: string | null;
    start_time: string | null;
    end_time: string | null;
    note: string | null;
  }[];
  const shifts = (shiftsResult.data ?? []) as {
    shift_date: string;
    start_time: string | null;
    end_time: string | null;
  }[];

  let deletion = sb.from("dienstplan_planned_slots").delete().in("slot_date", sorted).neq("source", "manual");
  if (!options.overwrite) deletion = deletion.is("assigned_employee_id", null);
  const { error: deleteError } = await deletion;
  if (deleteError) throw new Error(`Alte Slots konnten nicht ersetzt werden: ${deleteError.message}`);

  const inserts: Record<string, unknown>[] = [];
  for (const date of sorted) {
    const { slots } = slotsForDate(date, rules, overrides, periods);
    const candidates: {
      position: string | null;
      require_leader: boolean;
      start_time: string;
      end_time: string;
      note: string | null;
      source: string;
    }[] = [...slots];
    for (const event of events) {
      if (event.event_date !== date || !event.start_time || !event.end_time) continue;
      candidates.push({
        position: event.position,
        require_leader: false,
        start_time: event.start_time.slice(0, 5),
        end_time: event.end_time.slice(0, 5),
        note: `${event.title}${event.note ? ` – ${event.note}` : ""}`,
        source: "event",
      });
    }
    const remaining = options.overwrite
      ? candidates
      : removeCoveredSlots(
          candidates,
          shifts.filter((shift) => shift.shift_date === date)
        );
    for (const slot of remaining) {
      inserts.push({
        slot_date: date,
        position: slot.position,
        track_key: null,
        start_time: slot.start_time,
        end_time: slot.end_time,
        note: slot.note,
        source: slot.source,
        ...(hasLeaderColumn ? { require_leader: slot.require_leader } : {}),
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await sb.from("dienstplan_planned_slots").insert(inserts);
    if (error) throw new Error(`Slots konnten nicht angelegt werden: ${error.message}`);
  }
  return inserts.length;
}

export async function buildPreplanForMonthAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const overwriteExisting = formData.get("overwrite_existing") === "true";

  const sb = createAdminClient();
  const created = await regenerateSlotsForDates(sb, buildMonthDays(range.start, range.end), {
    overwrite: overwriteExisting,
  });

  await auditDienstplan(actor, "dienstplan_preplan_build", { month, created });

  revalidatePath(PLAN_PATH);
}

/** Tages-Anpassung vorbereiten: übernimmt die Wochenregeln des Tages als bearbeitbare Zeilen. */
async function ensureDayOverride(sb: ReturnType<typeof createAdminClient>, date: string) {
  const existing = await loadDayRequirements(sb, date, date);
  if (existing.length > 0) return;

  const { rules, periods } = await loadShiftRules(sb);
  const { slots } = slotsForDate(date, rules, [], periods);
  const grouped = new Map<string, DayRequirement>();
  for (const slot of slots) {
    const key = `${slot.position}|${slot.start_time}|${slot.end_time}`;
    const current = grouped.get(key);
    if (current) {
      current.required_count += 1;
      current.require_leader = current.require_leader || slot.require_leader;
    } else {
      grouped.set(key, {
        requirement_date: date,
        position: slot.position,
        require_leader: slot.require_leader,
        start_time: slot.start_time,
        end_time: slot.end_time,
        required_count: 1,
        note: slot.note,
      });
    }
  }
  if (grouped.size > 0) {
    const { error } = await sb.from("dienstplan_position_requirements").insert(Array.from(grouped.values()));
    if (error) throw new Error(error.message);
  }
}

function requireDate(formData: FormData) {
  const date = String(formData.get("requirement_date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ungültiges Datum.");
  return date;
}

export async function startDayOverrideAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const date = requireDate(formData);
  const sb = createAdminClient();
  await ensureDayOverride(sb, date);
  await auditDienstplan(actor, "dienstplan_requirement_save", { kind: "Tages-Anpassung gestartet", date });
  revalidatePath(PLAN_PATH);
}

export async function saveDayRequirementAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const date = requireDate(formData);
  const fields = parseRequirementFields(formData);
  const originalPosition = String(formData.get("original_position") || "").trim();
  const originalStart = String(formData.get("original_start_time") || "").trim();
  const originalEnd = String(formData.get("original_end_time") || "").trim();

  const sb = createAdminClient();
  await ensureDayOverride(sb, date);

  // „Kein Bedarf“-Platzhalter entfernen, sobald es wieder eine echte Zeile gibt
  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", date).eq("required_count", 0);
  if (originalPosition && originalStart && originalEnd) {
    await sb
      .from("dienstplan_position_requirements")
      .delete()
      .eq("requirement_date", date)
      .eq("position", originalPosition)
      .eq("start_time", originalStart)
      .eq("end_time", originalEnd);
  }
  const { error } = await sb.from("dienstplan_position_requirements").upsert(
    {
      requirement_date: date,
      position: fields.position,
      require_leader: fields.require_leader,
      start_time: fields.startTime,
      end_time: fields.endTime,
      required_count: fields.count,
      note: fields.note,
    },
    { onConflict: "requirement_date,position,start_time,end_time" }
  );
  if (error) throw new Error(error.message);

  await regenerateSlotsForDates(sb, [date], { overwrite: false });
  await auditDienstplan(actor, "dienstplan_requirement_save", {
    kind: "Tages-Anpassung",
    date,
    position: fields.position,
    leader: fields.require_leader,
  });
  revalidatePath(PLAN_PATH);
}

export async function deleteDayRequirementAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const date = requireDate(formData);
  const position = String(formData.get("position") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  if (!position || !startTime || !endTime) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_position_requirements")
    .delete()
    .eq("requirement_date", date)
    .eq("position", position)
    .eq("start_time", startTime)
    .eq("end_time", endTime);

  // Letzte Zeile entfernt → „kein Bedarf“ merken, damit nicht stillschweigend wieder die Wochenregeln greifen
  const remaining = await loadDayRequirements(sb, date, date);
  if (remaining.length === 0) {
    await sb.from("dienstplan_position_requirements").insert({
      requirement_date: date,
      position: CLOSED_DAY_POSITION,
      start_time: "00:00",
      end_time: "00:00",
      required_count: 0,
    });
  }

  await regenerateSlotsForDates(sb, [date], { overwrite: false });
  await auditDienstplan(actor, "dienstplan_requirement_delete", { kind: "Tages-Anpassung", date, position });
  revalidatePath(PLAN_PATH);
}

export async function closeDayAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const date = requireDate(formData);

  const sb = createAdminClient();
  await loadShiftRules(sb); // bricht bei fehlender Migration ab, bevor etwas gelöscht wird
  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", date);
  const { error } = await sb.from("dienstplan_position_requirements").insert({
    requirement_date: date,
    position: CLOSED_DAY_POSITION,
    start_time: "00:00",
    end_time: "00:00",
    required_count: 0,
  });
  if (error) throw new Error(error.message);

  await regenerateSlotsForDates(sb, [date], { overwrite: false });
  await auditDienstplan(actor, "dienstplan_requirement_save", { kind: "Tag ohne Bedarf", date });
  revalidatePath(PLAN_PATH);
}

export async function resetDayRequirementsAction(formData: FormData) {
  const actor = await assertAuthenticatedForDienstplanWrite();
  const date = requireDate(formData);

  const sb = createAdminClient();
  await loadShiftRules(sb);
  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", date);

  await regenerateSlotsForDates(sb, [date], { overwrite: false });
  await auditDienstplan(actor, "dienstplan_requirement_delete", { kind: "Tages-Anpassung zurückgesetzt", date });
  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// Zeiträume mit abweichenden Regeln (z. B. Ferien)
// ──────────────────────────────────────────────────────────────────────

const PERIODS_MISSING_HINT =
  "Zeiträume sind noch nicht eingerichtet. Bitte dienstplaner-rule-periods-migration.sql in Supabase ausführen.";

function parsePeriodFields(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("start_date") || "").trim();
  const endDate = String(formData.get("end_date") || "").trim();
  const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!name) throw new Error("Bitte einen Namen angeben.");
  if (!dateOk(startDate) || !dateOk(endDate)) throw new Error("Bitte Beginn und Ende des Zeitraums angeben.");
  if (endDate < startDate) throw new Error("Das Ende liegt vor dem Beginn.");
  return { name, start_date: startDate, end_date: endDate };
}

export async function saveRulePeriodAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id") || 0);
  const fields = parsePeriodFields(formData);

  const sb = createAdminClient();
  const result = id
    ? await sb.from("dienstplan_rule_periods").update(fields).eq("id", id)
    : await sb.from("dienstplan_rule_periods").insert(fields);
  if (result.error) throw new Error(`${PERIODS_MISSING_HINT} (${result.error.message})`);

  await auditDienstplan(actor, "dienstplan_requirement_save", {
    kind: "Regel-Zeitraum",
    mode: id ? "update" : "create",
    name: fields.name,
    from: fields.start_date,
    to: fields.end_date,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}

export async function deleteRulePeriodAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id") || 0);
  if (!id) return;

  const sb = createAdminClient();
  const { error } = await sb.from("dienstplan_rule_periods").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await auditDienstplan(actor, "dienstplan_requirement_delete", { kind: "Regel-Zeitraum", id });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}

/** Kopiert die Standardregeln als Startpunkt in einen (noch leeren) Zeitraum. */
export async function copyRulesToPeriodAction(formData: FormData) {
  const actor = await assertAdminForDienstplanAutomation();

  const periodId = Number(formData.get("period_id") || 0);
  if (!periodId) return;

  const sb = createAdminClient();
  const { rules } = await loadShiftRules(sb);
  if (rules.some((rule) => rule.period_id === periodId)) return;

  const copies = rules
    .filter((rule) => !rule.period_id)
    .map((rule) => ({
      position: rule.position,
      require_leader: rule.require_leader,
      start_time: rule.start_time,
      end_time: rule.end_time,
      weekdays: rule.weekdays,
      required_count: rule.required_count,
      note: rule.note,
      period_id: periodId,
    }));
  if (copies.length > 0) {
    const { error } = await sb.from("dienstplan_shift_rules").insert(copies);
    if (error) throw new Error(error.message);
  }

  await auditDienstplan(actor, "dienstplan_requirement_save", {
    kind: "Standardregeln in Zeitraum kopiert",
    periodId,
    count: copies.length,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/tools/dienstplaner/einstellungen");
  revalidatePath(PLAN_PATH);
}
