// src/app/tools/dienstplaner/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseShiftInput } from "./utils";

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
  const value = String(formData.get("value") || "");
  if (!employeeId || !shiftDate) return;

  const sb = createAdminClient();
  const parsed = parseShiftInput(value);

  if (!parsed) {
    await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", shiftDate);
    revalidatePath(PLAN_PATH);
    return;
  }

  await sb.from("dienstplan_shifts").upsert(
    {
      employee_id: employeeId,
      shift_date: shiftDate,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      raw_input: parsed.rawInput,
    },
    { onConflict: "employee_id,shift_date" }
  );

  revalidatePath(PLAN_PATH);
}

export async function bulkSaveShiftsAction(formData: FormData) {
  const sb = createAdminClient();
  const entries = Array.from(formData.entries());

  for (const [key, rawValue] of entries) {
    if (!key.startsWith("shift:")) continue;
    const [, employeeIdStr, date] = key.split(":");
    const employeeId = Number(employeeIdStr);
    const value = String(rawValue || "");
    if (!employeeId || !date) continue;

    const parsed = parseShiftInput(value);
    if (!parsed) {
      await sb.from("dienstplan_shifts").delete().eq("employee_id", employeeId).eq("shift_date", date);
      continue;
    }

    await sb.from("dienstplan_shifts").upsert(
      {
        employee_id: employeeId,
        shift_date: date,
        start_time: parsed.startTime,
        end_time: parsed.endTime,
        raw_input: parsed.rawInput,
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
