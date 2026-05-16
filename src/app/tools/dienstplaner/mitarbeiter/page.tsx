import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { formatUserDisplayName } from "@/lib/user-display";
import {
  createEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
} from "../actions";
import MitarbeiterClient from "./MitarbeiterClient";
import type { DirectoryUser, Employee } from "../utils";

export const metadata = { title: "Dienstplaner – Mitarbeiter" };
export const dynamic = "force-dynamic";

export default async function MitarbeiterPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  // Stufenweiser Fallback: neue Spalten (allowed_positions, user_id, position_category)
  // sind in alten DBs evtl. noch nicht vorhanden — dann lädt der nächste Versuch ohne sie.
  const baseColumns =
    "id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order";

  type EmployeeRow = Partial<Employee> & {
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
  };

  async function loadEmployees(extra: string): Promise<EmployeeRow[] | null> {
    const cols = extra ? `${baseColumns}, ${extra}` : baseColumns;
    const result = await sb
      .from("dienstplan_employees")
      .select(cols)
      .order("sort_order")
      .order("id");
    if (result.error) {
      console.warn("[dienstplaner/mitarbeiter] select failed for cols:", cols, result.error.message);
      return null;
    }
    return (result.data ?? []) as unknown as EmployeeRow[];
  }

  let rows =
    (await loadEmployees("position_category, allowed_positions, user_id")) ??
    (await loadEmployees("position_category, user_id")) ??
    (await loadEmployees("position_category")) ??
    (await loadEmployees("")) ??
    [];

  const employees: Employee[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    department: row.department,
    monthly_hours: row.monthly_hours,
    weekly_hours: row.weekly_hours,
    color: row.color,
    is_active: row.is_active,
    employment_type: row.employment_type,
    sort_order: row.sort_order,
    position_category: (row.position_category ?? null) as Employee["position_category"],
    allowed_positions: row.allowed_positions ?? null,
    user_id: row.user_id ?? null,
  }));

  let directoryUsers: DirectoryUser[] = [];
  if (isAdmin) {
    try {
      const client = await clerkClient();
      const list = await client.users.getUserList({ limit: 200, orderBy: "-created_at" });
      directoryUsers = list.data
        .map((u) => ({
          id: u.id,
          displayName: formatUserDisplayName({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            username: u.username,
            emailAddresses: u.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) ?? null,
          }),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
    } catch (e) {
      console.error("[dienstplaner/mitarbeiter] clerk user list failed", e);
    }
  }

  return (
    <MitarbeiterClient
      initialEmployees={employees}
      directoryUsers={directoryUsers}
      isAdmin={isAdmin}
      createAction={createEmployeeAction}
      updateAction={updateEmployeeAction}
      deleteAction={deleteEmployeeAction}
    />
  );
}
