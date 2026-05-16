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
  const { data } = await sb
    .from("dienstplan_employees")
    .select(
      "id, name, position, department, monthly_hours, weekly_hours, color, is_active, employment_type, sort_order, position_category, user_id"
    )
    .order("sort_order")
    .order("id");

  const employees = (data ?? []) as Employee[];

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
