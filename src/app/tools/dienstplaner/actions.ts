// /workspace/familiehake/src/app/tools/dienstplaner/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { addHoursToTime, generateAutoPlanSlots, type AutoPlanSlot, type PauseRule } from "./utils";

const PLAN_PATH = "/tools/dienstplaner";
const SETTINGS_PATH = "/tools/dienstplaner/settings";

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
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();
  if (!startTime || !endTime) {
    await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);
    revalidatePath(PLAN_PATH);
    return;
  }

  const { data: existingShift } = await sb
    .from("dienstplan_shifts")
    .select("break_minutes, comment, raw_input")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: existingShift?.break_minutes ?? null,
      comment: existingShift?.comment ?? null,
      raw_input: existingShift?.raw_input ?? null,
    },
    { onConflict: "employee_id,shift_date" }
  );

  revalidatePath(PLAN_PATH);
}

export async function bulkSaveShiftsAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const sb = createAdminClient();
  const entries = Array.from(formData.entries());
  const shiftEntries = new Map<string, { employeeId: number; date: string; startTime: string; endTime: string }>();

  for (const [key, rawValue] of entries) {
    if (!key.startsWith("shift:")) continue;
    const [, employeeIdStr, date, field] = key.split(":");
    const employeeId = Number(employeeIdStr);
    if (!employeeId || !date || (field !== "start" && field !== "end")) continue;
    const value = String(rawValue || "").trim();
    const entryKey = `${employeeId}-${date}`;
    const entry = shiftEntries.get(entryKey) ?? { employeeId, date, startTime: "", endTime: "" };
    if (field === "start") {
      entry.startTime = value;
    }
    if (field === "end") {
      entry.endTime = value;
    }
    shiftEntries.set(entryKey, entry);
  }

  for (const entry of shiftEntries.values()) {
    if (!entry.startTime || !entry.endTime) {
      await sb.from("dienstplan_shifts").delete().eq("employee_id", entry.employeeId).eq("shift_date", entry.date);
      continue;
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
        start_time: entry.startTime,
        end_time: entry.endTime,
        break_minutes: existingShift?.break_minutes ?? null,
        comment: existingShift?.comment ?? null,
        raw_input: existingShift?.raw_input ?? null,
      },
      { onConflict: "employee_id,shift_date" }
    );
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

export async function autoGenerateMonthPlanAction(formData: FormData) {
  await assertAdminForDienstplanAutomation();

  const month = String(formData.get("month") || "");
  const range = getMonthRange(month);
  if (!range) return;

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

  const generatedShifts = generateAutoPlanSlots({
    employees,
    existingShifts: [],
    availability,
    slots,
    pauseRules,
  });

  if (generatedShifts.length === 0) {
    return;
  }

  await sb.from("dienstplan_shifts").delete().gte("shift_date", range.start).lte("shift_date", range.end);
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
    return { ok: false, message: "Ungültige Verschiebung." };
  }

  const sb = createAdminClient();
  const { data: sourceShift } = await sb
    .from("dienstplan_shifts")
    .select("start_time, end_time, raw_input, break_minutes, comment")
    .eq("employee_id", fromEmployeeId)
    .eq("shift_date", shiftDate)
    .maybeSingle();
  if (!sourceShift?.start_time || !sourceShift.end_time) {
    return { ok: false, message: "Quelle der Schicht nicht gefunden." };
  }

  const { error: insertError } = await sb.from("dienstplan_shifts").insert(
    {
      employee_id: toEmployeeId,
      shift_date: shiftDate,
      start_time: sourceShift.start_time,
      end_time: sourceShift.end_time,
      break_minutes: sourceShift.break_minutes ?? null,
      comment: sourceShift.comment ?? null,
      raw_input: sourceShift.raw_input ?? "drag-drop",
    }
  );
  if (insertError) {
    return { ok: false, message: "Ziel hat bereits eine Schicht oder die Verschiebung ist fehlgeschlagen." };
  }

  const { error: deleteError } = await sb
    .from("dienstplan_shifts")
    .delete()
    .eq("employee_id", fromEmployeeId)
    .eq("shift_date", shiftDate);
  if (deleteError) {
    await sb.from("dienstplan_shifts").delete().eq("employee_id", toEmployeeId).eq("shift_date", shiftDate);
    return { ok: false, message: "Verschiebung konnte nicht abgeschlossen werden." };
  }

  revalidatePath(PLAN_PATH);
  return { ok: true };
}

export async function updateShiftDetailsAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const employeeId = Number(formData.get("employee_id"));
  const shiftDate = String(formData.get("shift_date") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  const breakMinutesRaw = String(formData.get("break_minutes") || "").trim();
  const comment = String(formData.get("comment") || "").trim();
  if (!employeeId || !shiftDate || !startTime || !endTime) return;

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

  revalidatePath(PLAN_PATH);
}

export async function createEmployeeAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const name = String(formData.get("name") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const monthlyHours = Number(formData.get("monthly_hours") || 0);
  const weeklyHours = Number(formData.get("weekly_hours") || 0);
  if (!name) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").insert({
    name,
    position: position || null,
    monthly_hours: monthlyHours,
    weekly_hours: weeklyHours,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updateEmployeeAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const updates: {
    name?: string;
    position?: string | null;
    monthly_hours?: number;
    weekly_hours?: number;
  } = {};
  const rawName = formData.get("name");
  if (typeof rawName === "string") {
    const value = rawName.trim();
    if (!value) return;
    updates.name = value;
  }
  const rawPosition = formData.get("position");
  if (typeof rawPosition === "string") {
    const value = rawPosition.trim();
    updates.position = value || null;
  }
  const rawMonthlyHours = formData.get("monthly_hours");
  if (typeof rawMonthlyHours === "string") {
    updates.monthly_hours = Number(rawMonthlyHours || 0);
  }
  const rawWeeklyHours = formData.get("weekly_hours");
  if (typeof rawWeeklyHours === "string") {
    updates.weekly_hours = Number(rawWeeklyHours || 0);
  }
  if (Object.keys(updates).length === 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").update(updates).eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteEmployeeAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").delete().eq("id", id);

  revalidatePath(SETTINGS_PATH);
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
  const fixedStart = String(formData.get("fixed_start") || "").trim();
  const fixedEnd = String(formData.get("fixed_end") || "").trim();
  if (!employeeId || !availabilityDate) return;

  const sb = createAdminClient();
  const normalizedStatus = status || null;
  const normalizedStart = status === "fix" && fixedStart ? fixedStart : null;
  const normalizedEnd = status === "fix" && fixedEnd ? fixedEnd : null;

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

export async function saveShiftTrackAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const trackKey = String(formData.get("track_key") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  if (!trackKey || !startTime || !endTime) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_shift_tracks").update({ start_time: startTime, end_time: endTime }).eq("track_key", trackKey);

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

export async function saveDateRequirementAction(formData: FormData) {
  await assertAuthenticatedForDienstplanWrite();

  const date = String(formData.get("requirement_date") || "");
  const requiredShifts = Number(formData.get("required_shifts"));
  if (!date || Number.isNaN(requiredShifts) || requiredShifts < 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_date_requirements").upsert(
    {
      requirement_date: date,
      required_shifts: requiredShifts,
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
