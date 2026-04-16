import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  saveShiftAction,
  deleteShiftAction,
  moveShiftAction,
  saveAvailabilityAction,
  autoGenerateMonthPlanAction,
  clearMonthAction,
} from "./actions";
import MonthlyGrid from "./components/MonthlyGrid";
import type { Employee, Shift, Availability, DateRequirement, ShiftTrack } from "./utils";
import { buildMonthDays, getCurrentMonth } from "./utils";
import type { PauseRule } from "./utils";

export const metadata = { title: "Dienstplaner" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function DienstplanerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawMonth = params.month ?? "";
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : getCurrentMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  const [
    empResult,
    shiftResult,
    availResult,
    reqResult,
    pauseResult,
    trackResult,
  ] = await Promise.all([
    sb
      .from("dienstplan_employees")
      .select("id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("id"),
    sb
      .from("dienstplan_shifts")
      .select("employee_id, shift_date, start_time, end_time, break_minutes, comment")
      .gte("shift_date", start)
      .lte("shift_date", end),
    sb
      .from("dienstplan_availability")
      .select("employee_id, availability_date, status, fixed_start, fixed_end")
      .gte("availability_date", start)
      .lte("availability_date", end),
    sb
      .from("dienstplan_date_requirements")
      .select("requirement_date, required_shifts, service_required_shifts, note")
      .gte("requirement_date", start)
      .lte("requirement_date", end),
    sb.from("dienstplan_pause_rules").select("min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_shift_tracks").select("track_key, label, start_time, end_time").order("start_time"),
  ]);

  const employees = (empResult.data ?? []) as Employee[];
  const shifts = (shiftResult.data ?? []) as Shift[];
  const availability = (availResult.data ?? []) as Availability[];
  const requirements = (reqResult.data ?? []) as DateRequirement[];
  const pauseRules = (pauseResult.data ?? []) as PauseRule[];
  const shiftTracks = (trackResult.data ?? []) as ShiftTrack[];
  const days = buildMonthDays(month);

  return (
    <MonthlyGrid
      month={month}
      days={days}
      employees={employees}
      shifts={shifts}
      availability={availability}
      requirements={requirements}
      pauseRules={pauseRules}
      shiftTracks={shiftTracks}
      isAdmin={isAdmin}
      saveShiftAction={saveShiftAction}
      deleteShiftAction={deleteShiftAction}
      moveShiftAction={moveShiftAction}
      saveAvailabilityAction={saveAvailabilityAction}
      autoGenerateAction={autoGenerateMonthPlanAction}
      clearMonthAction={clearMonthAction}
    />
  );
}
