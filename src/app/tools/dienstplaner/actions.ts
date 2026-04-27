// /workspace/familiehake/src/app/tools/dienstplaner/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  addHoursToTime,
  calculateShiftMinutes,
  calculateUrlaubMinutesByEmployee,
  generateAutoPlanSlots,
  type AutoPlanSlot,
  type PauseRule,
} from "./utils";
import { askAiToAssignSlots, dienstplanAiEnabled } from "@/lib/dienstplaner/ai";

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
}

export async function saveShiftAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "");
  const startTimeRaw = String(formData.get("start_time") || "");
  const endTimeRaw = String(formData.get("end_time") || "");
  const startTime = normalizeTimeInput(startTimeRaw);
  const endTime = normalizeTimeInput(endTimeRaw);
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();
  if (!startTimeRaw.trim() || !endTimeRaw.trim()) {
    await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);
    revalidatePath(PLAN_PATH);
    return;
  }
  if (!startTime || !endTime) {
    throw new Error("INVALID_SHIFT_TIME");
  }

  const breakMinutesRaw = formData.get("break_minutes");
  const breakMinutes = breakMinutesRaw !== null && breakMinutesRaw !== "" ? Number(breakMinutesRaw) : null;
  const comment = formData.get("comment") ? String(formData.get("comment")) : null;

  const { data: existingShift } = await sb
    .from("dienstplan_shifts")
    .select("raw_input")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      comment: comment,
      raw_input: existingShift?.raw_input ?? null,
    },
    { onConflict: "employee_id,shift_date" }
  );

  await consumeMatchingPlannedSlot(sb, shiftDate, startTime, endTime);

  revalidatePath(PLAN_PATH);
}

export async function bulkSaveShiftsAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  for (const entry of shiftEntries.values()) {
    if (!entry.startTimeRaw || !entry.endTimeRaw) {
      await sb.from("dienstplan_shifts").delete().eq("employee_id", entry.employeeId).eq("shift_date", entry.date);
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
  }

  revalidatePath(PLAN_PATH);
}

export async function clearMonthAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_shifts")
    .delete()
    .gte("shift_date", range.start)
    .lte("shift_date", range.end);

  revalidatePath(PLAN_PATH);
}

export async function saveEmploymentHourDefaultAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function clearMonthAvailabilityAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_availability")
    .delete()
    .gte("availability_date", range.start)
    .lte("availability_date", range.end);

  revalidatePath(PLAN_PATH);
  revalidatePath("/tools/dienstplaner/verfuegbarkeit");
}

export async function autoGenerateMonthPlanAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const minShiftHours = Math.max(0, Number(formData.get("min_shift_hours") || 0));
  const maxShiftsPerWeek = Math.max(1, Number(formData.get("max_shifts_per_week") || 7));
  const skipWeekends = formData.get("skip_weekends") === "true";
  const respectAvailability = formData.get("respect_availability") !== "false";
  const overwriteExisting = formData.get("overwrite_existing") === "true";

  const sb = createAdminClient();
  const [employeesResult, pauseRulesResult, availabilityResult, weekdayRequirementsResult, dateRequirementsResult, shiftTracksResult, weekdayPositionRequirementsResult, datePositionRequirementsResult] = await Promise.all([
    sb.from("dienstplan_employees").select("id, position, monthly_hours, weekly_hours"),
    sb.from("dienstplan_pause_rules").select("min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_availability").select("employee_id, availability_date, status, fixed_start, fixed_end").gte("availability_date", range.start).lte("availability_date", range.end),
    sb.from("dienstplan_weekday_requirements").select("weekday, required_shifts"),
    sb.from("dienstplan_date_requirements").select("requirement_date, required_shifts").gte("requirement_date", range.start).lte("requirement_date", range.end),
    sb.from("dienstplan_shift_tracks").select("track_key, start_time, end_time").order("start_time"),
    sb.from("dienstplan_weekday_position_requirements").select("weekday, track_key, position"),
    sb.from("dienstplan_position_requirements").select("requirement_date, position, track_key, start_time, end_time").gte("requirement_date", range.start).lte("requirement_date", range.end),
  ]);

  const employees = (employeesResult.data ?? []) as {
    id: number;
    position: string | null;
    monthly_hours: number;
    weekly_hours: number;
  }[];
  const pauseRules = (pauseRulesResult.data ?? []) as PauseRule[];
  const availability = (availabilityResult.data ?? []) as {
    employee_id: number;
    availability_date: string;
    status: string | null;
    fixed_start: string | null;
    fixed_end: string | null;
  }[];
  const weekdayRequirements = new Map<number, number>(
    ((weekdayRequirementsResult.data ?? []) as { weekday: number; required_shifts: number }[]).map((item) => [
      item.weekday,
      item.required_shifts,
    ])
  );
  const dateRequirements = new Map<string, number>(
    ((dateRequirementsResult.data ?? []) as { requirement_date: string; required_shifts: number }[]).map((item) => [
      item.requirement_date,
      item.required_shifts,
    ])
  );
  const shiftTracks = (shiftTracksResult.data ?? []) as { track_key: string; start_time: string; end_time: string }[];
  const weekdayPositionRequirements = (weekdayPositionRequirementsResult.data ?? []) as {
    weekday: number;
    track_key: string;
    position: string;
  }[];
  const datePositionRequirements = (datePositionRequirementsResult.data ?? []) as {
    requirement_date: string;
    position: string;
    track_key: string | null;
    start_time: string;
    end_time: string;
  }[];

  const trackMap = new Map(shiftTracks.map((track) => [track.track_key, track]));
  const weekdayPositionMap = new Map<number, { track_key: string; position: string }[]>();
  for (const requirement of weekdayPositionRequirements) {
    const list = weekdayPositionMap.get(requirement.weekday) ?? [];
    list.push(requirement);
    weekdayPositionMap.set(requirement.weekday, list);
  }
  const datePositionMap = new Map<string, typeof datePositionRequirements>();
  for (const requirement of datePositionRequirements) {
    const list = datePositionMap.get(requirement.requirement_date) ?? [];
    list.push(requirement);
    datePositionMap.set(requirement.requirement_date, list);
  }

  const monthDays = buildMonthDays(range.start, range.end);
  const slots: AutoPlanSlot[] = [];
  for (const day of monthDays) {
    const parsedDay = new Date(`${day}T00:00:00Z`);
    const weekday = parsedDay.getUTCDay();

    if (skipWeekends && (weekday === 0 || weekday === 6)) continue;
    const dateSpecificRequirements = datePositionMap.get(day) ?? [];

    if (dateSpecificRequirements.length > 0) {
      for (const requirement of dateSpecificRequirements) {
        const normalizedPosition = requirement.position.trim().toLowerCase();
        const defaultEnd = normalizedPosition === "serviceleitung" ? (addHoursToTime(requirement.start_time.slice(0, 5), 8) ?? requirement.end_time.slice(0, 5)) : requirement.end_time.slice(0, 5);
        slots.push({
          shift_date: day,
          position: requirement.position,
          start_time: requirement.start_time.slice(0, 5),
          end_time: defaultEnd,
        });
      }
      continue;
    }

    const weekdayDefaults = weekdayPositionMap.get(weekday) ?? [];
    if (weekdayDefaults.length > 0) {
      for (const requirement of weekdayDefaults) {
        const track = trackMap.get(requirement.track_key);
        if (!track) continue;
        const normalizedPosition = requirement.position.trim().toLowerCase();
        const defaultEnd = normalizedPosition === "serviceleitung" ? (addHoursToTime(track.start_time.slice(0, 5), 8) ?? track.end_time.slice(0, 5)) : track.end_time.slice(0, 5);
        slots.push({
          shift_date: day,
          position: requirement.position,
          start_time: track.start_time.slice(0, 5),
          end_time: defaultEnd,
        });
      }
      continue;
    }

    const fallbackCount = dateRequirements.get(day) ?? weekdayRequirements.get(weekday) ?? 0;
    for (let index = 0; index < fallbackCount; index += 1) {
      const track = shiftTracks[index % Math.max(shiftTracks.length, 1)];
      if (!track) continue;
      slots.push({
        shift_date: day,
        position: null,
        start_time: track.start_time.slice(0, 5),
        end_time: track.end_time.slice(0, 5),
      });
    }
  }

  // Wenn overwrite_existing=false: bestehende Schichten laden und als belegt markieren
  let existingShiftsForPlan: { employee_id: number; shift_date: string; start_time: string | null; end_time: string | null }[] = [];
  if (!overwriteExisting) {
    const { data: existing } = await sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end);
    existingShiftsForPlan = existing ?? [];
    // Tage mit bestehender Schicht aus den Slots entfernen
    const occupiedKeys = new Set(existingShiftsForPlan.map((s) => `${s.employee_id}-${s.shift_date}`));
    // Slots für Tage behalten, die noch nicht vollständig besetzt sind
    const occupiedDays = new Set(existingShiftsForPlan.map((s) => s.shift_date));
    // Nur Slots für Tage ohne jegliche Schicht übrig lassen
    slots.splice(0, slots.length, ...slots.filter((s) => !occupiedDays.has(s.shift_date)));
    void occupiedKeys; // wird in generateAutoPlanSlots via existingShifts berücksichtigt
  }

  // min_shift_hours: Slots herausfiltern, die kürzer als das Minimum sind
  const filteredSlots = minShiftHours > 0
    ? slots.filter((s) => {
        const startMins = s.start_time.split(":").reduce((h, m, i) => h + (i === 0 ? Number(m) * 60 : Number(m)), 0);
        let endMins = s.end_time.split(":").reduce((h, m, i) => h + (i === 0 ? Number(m) * 60 : Number(m)), 0);
        if (endMins <= startMins) endMins += 24 * 60;
        return (endMins - startMins) >= minShiftHours * 60;
      })
    : slots;

  const generatedShifts = generateAutoPlanSlots({
    employees,
    existingShifts: existingShiftsForPlan,
    availability: respectAvailability ? availability : [],
    slots: filteredSlots,
    pauseRules,
    maxShiftsPerWeek,
  });

  if (generatedShifts.length === 0) {
    return;
  }

  if (overwriteExisting) {
    await sb.from("dienstplan_shifts").delete().gte("shift_date", range.start).lte("shift_date", range.end);
  }
  if (generatedShifts.length > 0) {
    await sb.from("dienstplan_shifts").insert(
      generatedShifts.map((shift) => ({
        ...shift,
        break_minutes: null,
        comment: null,
        raw_input: "auto-generated",
      }))
    );
  }

  revalidatePath(PLAN_PATH);
}

export async function moveShiftAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const fromEmployeeId = Number(formData.get("from_employee_id"));
  const toEmployeeId = Number(formData.get("to_employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  if (!fromEmployeeId || !toEmployeeId || !shiftDate || fromEmployeeId === toEmployeeId) {
    throw new Error("Ungültige Verschiebung.");
  }

  const sb = createAdminClient();
  const { data: sourceShift } = await sb
    .from("dienstplan_shifts")
    .select("start_time, end_time, raw_input, break_minutes, comment")
    .eq("employee_id", fromEmployeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();
  if (!sourceShift?.start_time || !sourceShift.end_time) {
    throw new Error("Quelle der Schicht nicht gefunden.");
  }

  const { error: insertError } = await sb.from("dienstplan_shifts").insert({
    employee_id: toEmployeeId,
    shift_date: shiftDate,
    start_time: sourceShift.start_time,
    end_time: sourceShift.end_time,
    break_minutes: sourceShift.break_minutes ?? null,
    comment: sourceShift.comment ?? null,
    raw_input: sourceShift.raw_input ?? "drag-drop",
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

  revalidatePath(PLAN_PATH);
}

export async function copyWeekShiftsAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

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
    }
  }

  revalidatePath(PLAN_PATH);
}

export async function updateShiftDetailsAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  revalidatePath(PLAN_PATH);
}

export async function createEmployeeAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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
  if (!name) return;

  const sb = createAdminClient();
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
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updateEmployeeAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  if (Object.keys(updates).length === 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").update(updates).eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteEmployeeAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").delete().eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(MITARBEITER_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteShiftAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);

  revalidatePath(PLAN_PATH);
}

export async function createPauseRuleAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const minMinutes = Number(formData.get("min_minutes") || 0);
  const pauseMinutes = Number(formData.get("pause_minutes") || 0);
  if (minMinutes <= 0 || pauseMinutes <= 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").insert({ min_minutes: minMinutes, pause_minutes: pauseMinutes });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updatePauseRuleAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const minMinutes = Number(formData.get("min_minutes") || 0);
  const pauseMinutes = Number(formData.get("pause_minutes") || 0);
  if (!id || minMinutes <= 0 || pauseMinutes <= 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").update({ min_minutes: minMinutes, pause_minutes: pauseMinutes }).eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deletePauseRuleAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").delete().eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function saveAvailabilityAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  revalidatePath(PLAN_PATH);
}

export async function saveWeekdayRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const weekday = Number(formData.get("weekday"));
  const requiredShifts = Number(formData.get("required_shifts"));
  if (Number.isNaN(weekday) || weekday < 0 || weekday > 6 || Number.isNaN(requiredShifts) || requiredShifts < 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_weekday_requirements").upsert(
    {
      weekday,
      required_shifts: requiredShifts,
    },
    { onConflict: "weekday" }
  );

  revalidatePath(PLAN_PATH);
}

function slugifyTrackKey(value: string) {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base || "schiene";
}

export async function saveShiftTrackAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const trackKey = String(formData.get("track_key") || "").trim();
  const label = String(formData.get("label") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  if (!trackKey || !startTime || !endTime) return;

  const updates: Record<string, unknown> = { start_time: startTime, end_time: endTime };
  if (label) updates.label = label;

  const sb = createAdminClient();
  await sb.from("dienstplan_shift_tracks").update(updates).eq("track_key", trackKey);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function createShiftTrackAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const label = String(formData.get("label") || "").trim();
  const startTime = normalizeTimeInput(String(formData.get("start_time") || ""));
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  if (!label || !startTime || !endTime) return;

  const sb = createAdminClient();
  const baseSlug = slugifyTrackKey(label);
  let candidateKey = baseSlug;
  let suffix = 1;
  while (true) {
    const { data: existing } = await sb
      .from("dienstplan_shift_tracks")
      .select("track_key")
      .eq("track_key", candidateKey)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    candidateKey = `${baseSlug}-${suffix}`;
    if (suffix > 50) return;
  }

  await sb.from("dienstplan_shift_tracks").insert({
    track_key: candidateKey,
    label,
    start_time: startTime,
    end_time: endTime,
  });

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function deleteShiftTrackAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const trackKey = String(formData.get("track_key") || "").trim();
  if (!trackKey) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_shift_tracks").delete().eq("track_key", trackKey);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function createWeekdayPositionRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const weekday = Number(formData.get("weekday"));
  const trackKey = String(formData.get("track_key") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const note = String(formData.get("note") || "").trim();
  if (Number.isNaN(weekday) || weekday < 0 || weekday > 6 || !trackKey || !position) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_weekday_position_requirements").insert({
    weekday,
    track_key: trackKey,
    position,
    note: note || null,
  });

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function updateWeekdayPositionRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const weekday = Number(formData.get("weekday"));
  const trackKey = String(formData.get("track_key") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const note = String(formData.get("note") || "").trim();
  if (!id || Number.isNaN(weekday) || weekday < 0 || weekday > 6 || !trackKey || !position) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_weekday_position_requirements").update({
    weekday,
    track_key: trackKey,
    position,
    note: note || null,
  }).eq("id", id);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function deleteWeekdayPositionRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_weekday_position_requirements").delete().eq("id", id);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function savePositionMatrixRowAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const trackKey = String(formData.get("track_key") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const originalPositionRaw = formData.get("original_position");
  const originalPosition =
    typeof originalPositionRaw === "string" && originalPositionRaw.trim() ? originalPositionRaw.trim() : position;
  const note = String(formData.get("note") || "").trim();
  if (!trackKey || !position) return;

  const counts: Record<number, number> = {};
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const raw = formData.get(`count_${weekday}`);
    const value = raw === null ? 0 : Number(raw);
    counts[weekday] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  const sb = createAdminClient();
  await sb
    .from("dienstplan_weekday_position_requirements")
    .delete()
    .eq("track_key", trackKey)
    .eq("position", originalPosition);
  if (originalPosition !== position) {
    await sb
      .from("dienstplan_weekday_position_requirements")
      .delete()
      .eq("track_key", trackKey)
      .eq("position", position);
  }

  const inserts: { weekday: number; track_key: string; position: string; note: string | null }[] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const count = counts[weekday] ?? 0;
    for (let index = 0; index < count; index += 1) {
      inserts.push({ weekday, track_key: trackKey, position, note: note || null });
    }
  }
  if (inserts.length > 0) {
    await sb.from("dienstplan_weekday_position_requirements").insert(inserts);
  }

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function deletePositionMatrixRowAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const trackKey = String(formData.get("track_key") || "").trim();
  const position = String(formData.get("position") || "").trim();
  if (!trackKey || !position) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_weekday_position_requirements")
    .delete()
    .eq("track_key", trackKey)
    .eq("position", position);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function saveDateRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const date = String(formData.get("requirement_date") || "");
  const requiredShifts = Number(formData.get("required_shifts"));
  const serviceRequiredShifts = Number(formData.get("service_required_shifts"));
  const projectionRequiredShifts = Number(formData.get("projection_required_shifts"));
  const note = String(formData.get("note") || "").trim();
  if (!date || Number.isNaN(requiredShifts) || requiredShifts < 0) return;
  const normalizedServiceRequiredShifts =
    Number.isNaN(serviceRequiredShifts) || serviceRequiredShifts < 0 ? 0 : serviceRequiredShifts;
  const normalizedProjectionRequiredShifts =
    Number.isNaN(projectionRequiredShifts) || projectionRequiredShifts < 0 ? 0 : projectionRequiredShifts;

  const sb = createAdminClient();
  await sb.from("dienstplan_date_requirements").upsert(
    {
      requirement_date: date,
      required_shifts: requiredShifts,
      service_required_shifts: normalizedServiceRequiredShifts,
      projection_required_shifts: normalizedProjectionRequiredShifts,
      note: note || null,
    },
    { onConflict: "requirement_date" }
  );

  revalidatePath(PLAN_PATH);
}

export async function clearDateRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const date = String(formData.get("requirement_date") || "");
  if (!date) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_date_requirements").delete().eq("requirement_date", date);

  revalidatePath(PLAN_PATH);
}

export async function upsertPositionRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const requirementDate = String(formData.get("requirement_date") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const trackKey = String(formData.get("track_key") || "").trim();
  const originalPosition = String(formData.get("original_position") || "").trim();
  const originalStartTime = String(formData.get("original_start_time") || "").trim();
  const originalEndTime = String(formData.get("original_end_time") || "").trim();

  if (!requirementDate || !position || !startTime || !endTime) return;

  const sb = createAdminClient();
  const hasOriginalKey = originalPosition && originalStartTime && originalEndTime;
  const keyChanged =
    hasOriginalKey &&
    (originalPosition !== position || originalStartTime !== startTime || originalEndTime !== endTime);

  if (keyChanged) {
    await sb
      .from("dienstplan_position_requirements")
      .delete()
      .eq("requirement_date", requirementDate)
      .eq("position", originalPosition)
      .eq("start_time", originalStartTime)
      .eq("end_time", originalEndTime);
  }

  await sb.from("dienstplan_position_requirements").upsert(
    {
      requirement_date: requirementDate,
      position,
      start_time: startTime,
      end_time: endTime,
      note: note || null,
      track_key: trackKey || null,
    },
    { onConflict: "requirement_date,position,start_time,end_time" }
  );

  revalidatePath(PLAN_PATH);
}

export async function deletePositionRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const requirementDate = String(formData.get("requirement_date") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  if (!requirementDate || !position || !startTime || !endTime) return;

  const sb = createAdminClient();
  await sb
    .from("dienstplan_position_requirements")
    .delete()
    .eq("requirement_date", requirementDate)
    .eq("position", position)
    .eq("start_time", startTime)
    .eq("end_time", endTime);

  revalidatePath(PLAN_PATH);
}

export async function clearPositionRequirementsAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const requirementDate = String(formData.get("requirement_date") || "").trim();
  if (!requirementDate) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", requirementDate);

  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// Sonderveranstaltungen
// ──────────────────────────────────────────────────────────────────────

export async function createSpecialEventAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  revalidatePath(PLAN_PATH);
}

export async function updateSpecialEventAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

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

  revalidatePath(PLAN_PATH);
}

export async function deleteSpecialEventAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_special_events").delete().eq("id", id);

  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// Vorplanung – geplante (ggf. unbesetzte) Slots
// ──────────────────────────────────────────────────────────────────────

export async function createPlannedSlotAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const slotDate = String(formData.get("slot_date") || "").trim();
  const position = String(formData.get("position") || "").trim();
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
  });

  revalidatePath(PLAN_PATH);
}

export async function deletePlannedSlotAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_planned_slots").delete().eq("id", id);

  revalidatePath(PLAN_PATH);
}

export async function assignPlannedSlotAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  const employeeId = Number(formData.get("employee_id"));
  if (!id || !employeeId) return;

  const sb = createAdminClient();
  const { data: slot } = await sb
    .from("dienstplan_planned_slots")
    .select("id, slot_date, start_time, end_time, note")
    .eq("id", id)
    .maybeSingle();
  if (!slot) return;

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: slot.slot_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      break_minutes: null,
      comment: slot.note ?? null,
      raw_input: "from-planned-slot",
    },
    { onConflict: "employee_id,shift_date" }
  );

  await sb.from("dienstplan_planned_slots").delete().eq("id", id);

  revalidatePath(PLAN_PATH);
}

export async function buildPreplanForMonthAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const overwriteExisting = formData.get("overwrite_existing") === "true";

  const sb = createAdminClient();
  const [trackResult, weekdayPosResult, specialEventsResult, existingShiftsResult] = await Promise.all([
    sb.from("dienstplan_shift_tracks").select("track_key, start_time, end_time"),
    sb
      .from("dienstplan_weekday_position_requirements")
      .select("weekday, track_key, position, note"),
    sb
      .from("dienstplan_special_events")
      .select("event_date, title, position, start_time, end_time, note")
      .gte("event_date", range.start)
      .lte("event_date", range.end),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end),
  ]);

  const tracks = (trackResult.data ?? []) as { track_key: string; start_time: string; end_time: string }[];
  const trackMap = new Map(tracks.map((t) => [t.track_key, t]));
  const weekdayPositions = (weekdayPosResult.data ?? []) as {
    weekday: number;
    track_key: string;
    position: string;
    note: string | null;
  }[];
  const specialEvents = (specialEventsResult.data ?? []) as {
    event_date: string;
    title: string;
    position: string | null;
    start_time: string | null;
    end_time: string | null;
    note: string | null;
  }[];
  const existingShifts = (existingShiftsResult.data ?? []) as {
    employee_id: number;
    shift_date: string;
    start_time: string | null;
    end_time: string | null;
  }[];

  if (overwriteExisting) {
    await sb
      .from("dienstplan_planned_slots")
      .delete()
      .gte("slot_date", range.start)
      .lte("slot_date", range.end);
  } else {
    await sb
      .from("dienstplan_planned_slots")
      .delete()
      .is("assigned_employee_id", null)
      .gte("slot_date", range.start)
      .lte("slot_date", range.end);
  }

  const slotsByDate = new Map<string, { position: string | null; track_key: string | null; start_time: string; end_time: string; note: string | null; source: string }[]>();

  for (const day of buildMonthDays(range.start, range.end)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const list: NonNullable<ReturnType<typeof slotsByDate.get>> = [];

    for (const requirement of weekdayPositions) {
      if (requirement.weekday !== weekday) continue;
      const track = trackMap.get(requirement.track_key);
      if (!track) continue;
      list.push({
        position: requirement.position,
        track_key: requirement.track_key,
        start_time: track.start_time.slice(0, 5),
        end_time: track.end_time.slice(0, 5),
        note: requirement.note,
        source: "weekday_default",
      });
    }

    slotsByDate.set(day, list);
  }

  for (const event of specialEvents) {
    if (!event.start_time || !event.end_time) continue;
    const list = slotsByDate.get(event.event_date) ?? [];
    list.push({
      position: event.position,
      track_key: null,
      start_time: event.start_time.slice(0, 5),
      end_time: event.end_time.slice(0, 5),
      note: `${event.title}${event.note ? ` – ${event.note}` : ""}`,
      source: "event",
    });
    slotsByDate.set(event.event_date, list);
  }

  const inserts: {
    slot_date: string;
    position: string | null;
    track_key: string | null;
    start_time: string;
    end_time: string;
    note: string | null;
    source: string;
  }[] = [];

  if (!overwriteExisting) {
    const existingByDate = new Map<string, number>();
    for (const shift of existingShifts) {
      existingByDate.set(shift.shift_date, (existingByDate.get(shift.shift_date) ?? 0) + 1);
    }
    for (const [date, list] of slotsByDate) {
      const existing = existingByDate.get(date) ?? 0;
      const remaining = list.slice(existing);
      for (const slot of remaining) {
        inserts.push({ slot_date: date, ...slot });
      }
    }
  } else {
    for (const [date, list] of slotsByDate) {
      for (const slot of list) {
        inserts.push({ slot_date: date, ...slot });
      }
    }
  }

  if (inserts.length > 0) {
    await sb.from("dienstplan_planned_slots").insert(inserts);
  }

  revalidatePath(PLAN_PATH);
}

export async function autoFillPlannedSlotsAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  const [
    employeesResult,
    slotsResult,
    availabilityResult,
    pauseRulesResult,
    existingShiftsResult,
    hourDefaultsResult,
  ] = await Promise.all([
    sb
      .from("dienstplan_employees")
      .select("id, position, position_category, employment_type, monthly_hours, weekly_hours")
      .eq("is_active", true),
    sb
      .from("dienstplan_planned_slots")
      .select("id, slot_date, position, start_time, end_time")
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
  ]);

  const employees = (employeesResult.data ?? []) as {
    id: number;
    position: string | null;
    position_category: string | null;
    employment_type: string;
    monthly_hours: number;
    weekly_hours: number;
  }[];
  const slots = (slotsResult.data ?? []) as {
    id: number;
    slot_date: string;
    position: string | null;
    start_time: string;
    end_time: string;
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

  const extraMinutesByEmployee = calculateUrlaubMinutesByEmployee(
    availability.map((a) => ({ employee_id: a.employee_id, status: a.status })),
    employees.map((e) => ({ id: e.id, employment_type: e.employment_type })),
    hourDefaults
  );

  const generated = generateAutoPlanSlots({
    employees,
    existingShifts,
    availability,
    slots: slots.map((slot) => ({
      shift_date: slot.slot_date,
      position: slot.position,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
    })),
    pauseRules,
    maxShiftsPerWeek: 7,
    extraMonthlyMinutesByEmployee: extraMinutesByEmployee,
  });

  if (generated.length === 0) return;

  // Map jeden geplanten Slot der ersten passenden Zuweisung zu (Datum + Zeit)
  const assignedSlotIds = new Set<number>();
  const filledShifts: typeof generated = [];
  for (const assignment of generated) {
    const matching = slots.find(
      (slot) =>
        !assignedSlotIds.has(slot.id) &&
        slot.slot_date === assignment.shift_date &&
        slot.start_time.slice(0, 5) === assignment.start_time &&
        slot.end_time.slice(0, 5) === assignment.end_time
    );
    if (!matching) continue;
    assignedSlotIds.add(matching.id);
    filledShifts.push(assignment);
  }

  if (filledShifts.length > 0) {
    await sb.from("dienstplan_shifts").upsert(
      filledShifts.map((shift) => ({
        ...shift,
        break_minutes: null,
        comment: null,
        raw_input: "auto-fill-slot",
      })),
      { onConflict: "employee_id,shift_date" }
    );
  }

  if (assignedSlotIds.size > 0) {
    await sb
      .from("dienstplan_planned_slots")
      .delete()
      .in("id", Array.from(assignedSlotIds));
  }

  revalidatePath(PLAN_PATH);
}

// ──────────────────────────────────────────────────────────────────────
// KI-Assistent: ordnet unbesetzte Slots fairen Mitarbeitenden zu
// ──────────────────────────────────────────────────────────────────────

export async function aiFillPlannedSlotsAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  if (!dienstplanAiEnabled()) {
    throw new Error("KI ist nicht verfügbar (AI_GATEWAY_API_KEY fehlt).");
  }

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

  const sb = createAdminClient();
  const [
    employeesResult,
    slotsResult,
    availabilityResult,
    shiftsResult,
    pauseRulesResult,
    hourDefaultsResult,
  ] = await Promise.all([
    sb
      .from("dienstplan_employees")
      .select("id, name, position, position_category, employment_type, monthly_hours, weekly_hours")
      .eq("is_active", true),
    sb
      .from("dienstplan_planned_slots")
      .select("id, slot_date, position, start_time, end_time, note")
      .is("assigned_employee_id", null)
      .gte("slot_date", range.start)
      .lte("slot_date", range.end)
      .order("slot_date"),
    sb
      .from("dienstplan_availability")
      .select("employee_id, availability_date, status, fixed_start, fixed_end")
      .gte("availability_date", range.start)
      .lte("availability_date", range.end),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, start_time, end_time, break_minutes")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end),
    sb.from("dienstplan_pause_rules").select("min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_employment_hour_defaults").select("employment_type, vacation_hours_per_day"),
  ]);

  const employees = (employeesResult.data ?? []) as {
    id: number;
    name: string;
    position: string | null;
    position_category: string | null;
    employment_type: string;
    monthly_hours: number;
    weekly_hours: number;
  }[];
  const slots = (slotsResult.data ?? []) as {
    id: number;
    slot_date: string;
    position: string | null;
    start_time: string;
    end_time: string;
    note: string | null;
  }[];
  const availability = (availabilityResult.data ?? []) as {
    employee_id: number;
    availability_date: string;
    status: string | null;
    fixed_start: string | null;
    fixed_end: string | null;
  }[];
  const shifts = (shiftsResult.data ?? []) as {
    employee_id: number;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number | null;
  }[];
  const pauseRules = (pauseRulesResult.data ?? []) as PauseRule[];
  const hourDefaults = (hourDefaultsResult.data ?? []) as {
    employment_type: string;
    vacation_hours_per_day: number;
  }[];

  if (slots.length === 0) return;

  const urlaubMinutesByEmployee = calculateUrlaubMinutesByEmployee(
    availability.map((a) => ({ employee_id: a.employee_id, status: a.status })),
    employees.map((e) => ({ id: e.id, employment_type: e.employment_type })),
    hourDefaults
  );

  const currentHoursByEmployee = new Map<number, number>();
  for (const shift of shifts) {
    const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules, shift.break_minutes);
    if (!summary) continue;
    currentHoursByEmployee.set(
      shift.employee_id,
      (currentHoursByEmployee.get(shift.employee_id) ?? 0) + summary.workMinutes / 60
    );
  }
  for (const [empId, mins] of urlaubMinutesByEmployee) {
    currentHoursByEmployee.set(empId, (currentHoursByEmployee.get(empId) ?? 0) + mins / 60);
  }

  const aiResponse = await askAiToAssignSlots({
    month,
    slots: slots.map((slot) => ({
      id: slot.id,
      date: slot.slot_date,
      weekday: new Date(`${slot.slot_date}T00:00:00Z`).getUTCDay(),
      position: slot.position,
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      note: slot.note,
    })),
    employees: employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      position: emp.position,
      position_category: emp.position_category,
      monthly_target_hours: Number(emp.monthly_hours) || 0,
      weekly_target_hours: Number(emp.weekly_hours) || 0,
      current_month_hours: Math.round(((currentHoursByEmployee.get(emp.id) ?? 0) + Number.EPSILON) * 100) / 100,
    })),
    availability: availability.map((entry) => ({
      employee_id: entry.employee_id,
      date: entry.availability_date,
      status: entry.status,
      fixed_start: entry.fixed_start,
      fixed_end: entry.fixed_end,
    })),
  });

  if (aiResponse.assignments.length === 0) return;

  const slotsById = new Map(slots.map((s) => [s.id, s]));
  const employeeIds = new Set(employees.map((e) => e.id));
  const usedEmployeeOnDay = new Set<string>();
  const blockedByAvailability = new Set<string>();
  for (const entry of availability) {
    const status = (entry.status ?? "").toLowerCase();
    if (status === "f" || status === "u" || status === "k") {
      blockedByAvailability.add(`${entry.employee_id}-${entry.availability_date}`);
    }
  }
  const validAssignments: { slot_id: number; employee_id: number }[] = [];

  for (const a of aiResponse.assignments) {
    const slot = slotsById.get(a.slot_id);
    if (!slot) continue;
    if (!employeeIds.has(a.employee_id)) continue;
    const dayKey = `${a.employee_id}-${slot.slot_date}`;
    if (blockedByAvailability.has(dayKey)) continue; // F/U/K hart sperren, falls die KI sich verirrt
    if (usedEmployeeOnDay.has(dayKey)) continue;
    usedEmployeeOnDay.add(dayKey);
    validAssignments.push({ slot_id: slot.id, employee_id: a.employee_id });
  }

  if (validAssignments.length === 0) return;

  const inserts = validAssignments
    .map(({ slot_id, employee_id }) => {
      const slot = slotsById.get(slot_id);
      if (!slot) return null;
      return {
        employee_id,
        shift_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        break_minutes: null,
        comment: slot.note ?? null,
        raw_input: "ai-assignment",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (inserts.length > 0) {
    await sb.from("dienstplan_shifts").upsert(inserts, { onConflict: "employee_id,shift_date" });
    await sb
      .from("dienstplan_planned_slots")
      .delete()
      .in(
        "id",
        validAssignments.map((a) => a.slot_id)
      );
  }

  revalidatePath(PLAN_PATH);
}

export async function applyWeekdayDefaultsToDateAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const requirementDate = String(formData.get("requirement_date") || "").trim();
  if (!requirementDate) return;

  const date = new Date(`${requirementDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return;
  const weekday = date.getUTCDay();

  const sb = createAdminClient();
  const { data: weekdayDefaults } = await sb
    .from("dienstplan_weekday_position_requirements")
    .select("weekday, track_key, position, note")
    .eq("weekday", weekday);
  const { data: shiftTracks } = await sb.from("dienstplan_shift_tracks").select("track_key, start_time, end_time");

  const trackMap = new Map(
    ((shiftTracks as { track_key: string; start_time: string; end_time: string }[] | null) ?? []).map((track) => [
      track.track_key,
      track,
    ])
  );

  const inserts = ((weekdayDefaults as { track_key: string; position: string; note: string | null }[] | null) ?? [])
    .map((entry) => {
      const track = trackMap.get(entry.track_key);
      if (!track) return null;
      return {
        requirement_date: requirementDate,
        position: entry.position,
        start_time: track.start_time,
        end_time: track.end_time,
        note: entry.note ?? null,
        track_key: entry.track_key,
      };
    })
    .filter(Boolean) as {
    requirement_date: string;
    position: string;
    start_time: string;
    end_time: string;
    note: string | null;
    track_key: string;
  }[];

  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", requirementDate);
  if (inserts.length > 0) {
    await sb.from("dienstplan_position_requirements").insert(inserts);
  }

  revalidatePath(PLAN_PATH);
}
