import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import VerfuegbarkeitClient from "./VerfuegbarkeitClient";
import { saveAvailabilityAction, clearMonthAvailabilityAction } from "../actions";
import type { Availability, Employee } from "../utils";
import { buildMonthDays, getCurrentMonth } from "../utils";
import { CalendarDays } from "lucide-react";

export const metadata = { title: "Dienstplaner – Verfügbarkeiten" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function VerfuegbarkeitPage({ searchParams }: PageProps) {
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

  const empWithCategory = await sb
    .from("dienstplan_employees")
    .select(`${employeesBaseColumns}, position_category`)
    .eq("is_active", true)
    .order("sort_order")
    .order("id");

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

  let employeeRows: EmployeeRow[] = (empWithCategory.data ?? []) as EmployeeRow[];
  if (empWithCategory.error) {
    const fallback = await sb
      .from("dienstplan_employees")
      .select(employeesBaseColumns)
      .eq("is_active", true)
      .order("sort_order")
      .order("id");
    employeeRows = (fallback.data ?? []) as EmployeeRow[];
  }

  const availResult = await sb
    .from("dienstplan_availability")
    .select("employee_id, availability_date, status, fixed_start, fixed_end")
    .gte("availability_date", start)
    .lte("availability_date", end);

  const employees: Employee[] = employeeRows.map((row) => ({
    ...row,
    position_category: (row.position_category ?? null) as Employee["position_category"],
  }));
  const availability = (availResult.data ?? []) as Availability[];
  const days = buildMonthDays(month);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-6 animate-fade-up">
      <div className="flex flex-col gap-2">
        <div
          className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
          style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
        >
          <CalendarDays size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--primary))" }}
          >
            Planung
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Verfügbarkeiten</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Trage Frei-Tage, Urlaub, Krankheit und Schichtpräferenzen pro Mitarbeiter ein.
          </p>
        </div>
      </div>

      <VerfuegbarkeitClient
        month={month}
        days={days}
        employees={employees}
        availability={availability}
        isAdmin={isAdmin}
        saveAvailabilityAction={saveAvailabilityAction}
        clearMonthAvailabilityAction={clearMonthAvailabilityAction}
      />
    </div>
  );
}
