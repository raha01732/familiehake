import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  createEmployeeAction,
  updateEmployeeAction,
  deleteEmployeeAction,
} from "../actions";
import MitarbeiterClient from "./MitarbeiterClient";
import type { Employee } from "../utils";

export const metadata = { title: "Dienstplaner – Mitarbeiter" };
export const dynamic = "force-dynamic";

export default async function MitarbeiterPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  const { data } = await sb
    .from("dienstplan_employees")
    .select("id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order")
    .order("sort_order")
    .order("id");

  const employees = (data ?? []) as Employee[];

  return (
    <MitarbeiterClient
      initialEmployees={employees}
      isAdmin={isAdmin}
      createAction={createEmployeeAction}
      updateAction={updateEmployeeAction}
      deleteAction={deleteEmployeeAction}
    />
  );
}
