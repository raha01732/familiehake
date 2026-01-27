// src/app/tools/dienstplaner/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function saveShiftAction(formData: FormData) {
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

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      raw_input: null,
    },
    { onConflict: "employee_id,shift_date" }
  );

  revalidatePath(PLAN_PATH);
}

export async function bulkSaveShiftsAction(formData: FormData) {
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

    await sb.from("dienstplan_shifts").upsert(
      {
        employee_id: entry.employeeId,
        shift_date: entry.date,
        start_time: entry.startTime,
        end_time: entry.endTime,
        raw_input: null,
      },
      { onConflict: "employee_id,shift_date" }
    );
  }

  revalidatePath(PLAN_PATH);
}

export async function clearMonthAction(formData: FormData) {
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

export async function createEmployeeAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const monthlyHours = Number(formData.get("monthly_hours") || 0);
  if (!name) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").insert({
    name,
    position: position || null,
    monthly_hours: monthlyHours,
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updateEmployeeAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const position = String(formData.get("position") || "").trim();
  const monthlyHours = Number(formData.get("monthly_hours") || 0);
  if (!id || !name) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").update({ name, position, monthly_hours: monthlyHours }).eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function deleteEmployeeAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_employees").delete().eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function createPauseRuleAction(formData: FormData) {
  const minMinutes = Number(formData.get("min_minutes") || 0);
  const pauseMinutes = Number(formData.get("pause_minutes") || 0);
  if (minMinutes <= 0 || pauseMinutes <= 0) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").insert({ min_minutes: minMinutes, pause_minutes: pauseMinutes });

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function updatePauseRuleAction(formData: FormData) {
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
  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_pause_rules").delete().eq("id", id);

  revalidatePath(SETTINGS_PATH);
  revalidatePath(PLAN_PATH);
}

export async function saveAvailabilityAction(formData: FormData) {
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
  const id = Number(formData.get("id"));
  if (!id) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_weekday_position_requirements").delete().eq("id", id);

  revalidatePath(PLAN_PATH);
  revalidatePath(SETTINGS_PATH);
}

export async function saveDateRequirementAction(formData: FormData) {
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
  const date = String(formData.get("requirement_date") || "");
  if (!date) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_date_requirements").delete().eq("requirement_date", date);

  revalidatePath(PLAN_PATH);
}

export async function upsertPositionRequirementAction(formData: FormData) {
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
  const requirementDate = String(formData.get("requirement_date") || "").trim();
  if (!requirementDate) return;

  const sb = createAdminClient();
  await sb.from("dienstplan_position_requirements").delete().eq("requirement_date", requirementDate);

  revalidatePath(PLAN_PATH);
}

export async function applyWeekdayDefaultsToDateAction(formData: FormData) {
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
