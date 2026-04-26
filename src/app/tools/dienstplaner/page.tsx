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
  buildPreplanForMonthAction,
  autoFillPlannedSlotsAction,
  aiFillPlannedSlotsAction,
  createSpecialEventAction,
  updateSpecialEventAction,
  deleteSpecialEventAction,
  createPlannedSlotAction,
  deletePlannedSlotAction,
  assignPlannedSlotAction,
} from "./actions";
import MonthlyGrid from "./components/MonthlyGrid";
import type {
  Employee,
  Shift,
  Availability,
  ShiftTrack,
  SpecialEvent,
  PlannedSlot,
} from "./utils";
import { buildMonthDays, getCurrentMonth } from "./utils";
import type { PauseRule } from "./utils";
import { dienstplanAiEnabled } from "@/lib/dienstplaner/ai";

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

  const employeesBaseColumns =
    "id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order";

  type EmployeeRow = {
    id: number;
    name: string;
    position: string | null;
    department: string | null;
    monthly_hours: number;
    weekly_hours: number;
    color: string;
    is_active: boolean;
    employment_type: string;
    sort_order: number;
    position_category?: string | null;
  };

  const empWithCategory = await sb
    .from("dienstplan_employees")
    .select(`${employeesBaseColumns}, position_category`)
    .eq("is_active", true)
    .order("sort_order")
    .order("id");

  let employeeRows: EmployeeRow[] = (empWithCategory.data ?? []) as EmployeeRow[];

  // Fallback wenn die neue Spalte position_category in der DB noch nicht angelegt ist
  if (empWithCategory.error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[dienstplaner] employees with position_category failed, fallback:",
        empWithCategory.error.message
      );
    }
    const fallback = await sb
      .from("dienstplan_employees")
      .select(employeesBaseColumns)
      .eq("is_active", true)
      .order("sort_order")
      .order("id");
    employeeRows = (fallback.data ?? []) as EmployeeRow[];
  }

  const [shiftResult, availResult, pauseResult, trackResult, eventsResult, plannedResult] = await Promise.all([
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
    sb.from("dienstplan_pause_rules").select("min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_shift_tracks").select("track_key, label, start_time, end_time").order("start_time"),
    sb
      .from("dienstplan_special_events")
      .select("id, event_date, title, position, start_time, end_time, note")
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date")
      .order("start_time"),
    sb
      .from("dienstplan_planned_slots")
      .select("id, slot_date, position, track_key, start_time, end_time, note, source, assigned_employee_id")
      .gte("slot_date", start)
      .lte("slot_date", end)
      .order("slot_date")
      .order("start_time"),
  ]);

  const employees: Employee[] = employeeRows.map((row) => ({
    ...row,
    position_category: (row.position_category ?? null) as Employee["position_category"],
  }));
  const shifts = (shiftResult.data ?? []) as Shift[];
  const availability = (availResult.data ?? []) as Availability[];
  const pauseRules = (pauseResult.data ?? []) as PauseRule[];
  const shiftTracks = (trackResult.data ?? []) as ShiftTrack[];
  const specialEvents = (eventsResult.data ?? []) as SpecialEvent[];
  const plannedSlots = (plannedResult.data ?? []) as PlannedSlot[];
  const days = buildMonthDays(month);
  const aiEnabled = dienstplanAiEnabled();

  return (
    <MonthlyGrid
      month={month}
      days={days}
      employees={employees}
      shifts={shifts}
      availability={availability}
      pauseRules={pauseRules}
      shiftTracks={shiftTracks}
      specialEvents={specialEvents}
      plannedSlots={plannedSlots}
      isAdmin={isAdmin}
      aiEnabled={aiEnabled}
      saveShiftAction={saveShiftAction}
      deleteShiftAction={deleteShiftAction}
      moveShiftAction={moveShiftAction}
      saveAvailabilityAction={saveAvailabilityAction}
      autoGenerateAction={autoGenerateMonthPlanAction}
      clearMonthAction={clearMonthAction}
      buildPreplanAction={buildPreplanForMonthAction}
      autoFillSlotsAction={autoFillPlannedSlotsAction}
      aiFillSlotsAction={aiFillPlannedSlotsAction}
      createSpecialEventAction={createSpecialEventAction}
      updateSpecialEventAction={updateSpecialEventAction}
      deleteSpecialEventAction={deleteSpecialEventAction}
      createPlannedSlotAction={createPlannedSlotAction}
      deletePlannedSlotAction={deletePlannedSlotAction}
      assignPlannedSlotAction={assignPlannedSlotAction}
    />
  );
}
