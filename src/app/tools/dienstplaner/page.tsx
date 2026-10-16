import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  saveShiftAction,
  deleteShiftAction,
  moveShiftAction,
  saveAvailabilityAction,
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
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import { isDienstplanEditor } from "@/lib/dienstplaner/availability-guard";
import type {
  Employee,
  EmploymentHourDefault,
  Shift,
  Availability,
  ShiftTrack,
  SpecialEvent,
  PlannedSlot,
} from "./utils";
import { buildMonthDays, getCurrentMonth } from "./utils";
import { describePosition, type DayRequirement, type ShiftRule } from "./requirements";
import type { PauseRule } from "./utils";
import { dienstplanAiEnabled } from "@/lib/dienstplaner/ai";
import { loadPlanningRules } from "@/lib/dienstplaner/planning-rules";

export const metadata = { title: "Dienstplaner" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function DienstplanerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/dienstplaner", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }
  const rawMonth = params.month ?? "";
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : getCurrentMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;
  const canEditAvailability = isAdmin || (user ? await isDienstplanEditor(user.id) : false);

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
    can_double_as_projektion?: boolean | null;
  };

  const empWithCategory = await sb
    .from("dienstplan_employees")
    .select(`${employeesBaseColumns}, position_category, can_double_as_projektion`)
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

  const shiftsBaseColumns = "employee_id, shift_date, start_time, end_time, break_minutes, comment";

  const [shiftResult, availResult, pauseResult, trackResult, eventsResult, plannedResult, hourDefaultsResult, rulesResult, dayReqResult] = await Promise.all([
    sb
      .from("dienstplan_shifts")
      .select(`${shiftsBaseColumns}, covers_projektion`)
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
      .select("id, slot_date, position, track_key, start_time, end_time, note, source, assigned_employee_id, require_leader")
      .gte("slot_date", start)
      .lte("slot_date", end)
      .order("slot_date")
      .order("start_time"),
    sb
      .from("dienstplan_employment_hour_defaults")
      .select("employment_type, vacation_hours_per_day"),
    sb
      .from("dienstplan_shift_rules")
      .select("id, position, require_leader, start_time, end_time, weekdays, required_count, note")
      .order("start_time")
      .order("id"),
    sb
      .from("dienstplan_position_requirements")
      .select("requirement_date, position, require_leader, start_time, end_time, required_count, note")
      .gte("requirement_date", start)
      .lte("requirement_date", end),
  ]);

  const employees: Employee[] = employeeRows.map((row) => ({
    ...row,
    position_category: (row.position_category ?? null) as Employee["position_category"],
    can_double_as_projektion: row.can_double_as_projektion ?? false,
  }));
  let shifts = (shiftResult.data ?? []) as Shift[];

  // Fallback wenn die neue Spalte covers_projektion in der DB noch nicht angelegt ist
  if (shiftResult.error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dienstplaner] shifts with covers_projektion failed, fallback:", shiftResult.error.message);
    }
    const fallback = await sb
      .from("dienstplan_shifts")
      .select(shiftsBaseColumns)
      .gte("shift_date", start)
      .lte("shift_date", end);
    shifts = (fallback.data ?? []) as Shift[];
  }

  const availability = (availResult.data ?? []) as Availability[];
  const pauseRules = (pauseResult.data ?? []) as PauseRule[];
  const specialEvents = (eventsResult.data ?? []) as SpecialEvent[];

  // Fallback, solange die Spalte require_leader (Migration) noch fehlt
  let plannedSlots = (plannedResult.data ?? []) as PlannedSlot[];
  if (plannedResult.error) {
    const fallback = await sb
      .from("dienstplan_planned_slots")
      .select("id, slot_date, position, track_key, start_time, end_time, note, source, assigned_employee_id")
      .gte("slot_date", start)
      .lte("slot_date", end)
      .order("slot_date")
      .order("start_time");
    plannedSlots = (fallback.data ?? []) as PlannedSlot[];
  }

  const shiftRules = rulesResult.error
    ? []
    : ((rulesResult.data ?? []) as ShiftRule[]).map((rule) => ({
        ...rule,
        start_time: rule.start_time.slice(0, 5),
        end_time: rule.end_time.slice(0, 5),
        weekdays: (rule.weekdays ?? []).map(Number),
      }));
  const dayRequirements = dayReqResult.error
    ? []
    : ((dayReqResult.data ?? []) as DayRequirement[]).map((row) => ({
        ...row,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      }));

  // Schnellauswahl im Schicht-Dialog: die Zeiten aus den Regeln (plus alte Schienen, falls vorhanden)
  const shiftTracks: ShiftTrack[] = [];
  const seenTimes = new Set<string>();
  for (const rule of shiftRules) {
    const key = `${rule.start_time}-${rule.end_time}`;
    if (seenTimes.has(key)) continue;
    seenTimes.add(key);
    shiftTracks.push({
      track_key: `rule-${key}`,
      label: describePosition(rule.position, rule.require_leader),
      start_time: rule.start_time,
      end_time: rule.end_time,
    });
  }
  for (const track of (trackResult.data ?? []) as ShiftTrack[]) {
    const key = `${track.start_time.slice(0, 5)}-${track.end_time.slice(0, 5)}`;
    if (seenTimes.has(key)) continue;
    seenTimes.add(key);
    shiftTracks.push(track);
  }

  const employmentHourDefaults = (hourDefaultsResult.data ?? []) as EmploymentHourDefault[];
  const days = buildMonthDays(month);
  const aiEnabled = dienstplanAiEnabled();
  const planningRules = await loadPlanningRules(sb);

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
      employmentHourDefaults={employmentHourDefaults}
      isAdmin={isAdmin}
      canEditAvailability={canEditAvailability}
      aiEnabled={aiEnabled}
      shiftRules={shiftRules}
      dayRequirements={dayRequirements}
      planningRules={planningRules}
      saveShiftAction={saveShiftAction}
      deleteShiftAction={deleteShiftAction}
      moveShiftAction={moveShiftAction}
      saveAvailabilityAction={saveAvailabilityAction}
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
