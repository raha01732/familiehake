// src/lib/access-db.ts
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";
import { checkDatabaseLiveWithClient, type DatabaseLiveStatus } from "@/lib/check-database-live";
import { createAdminClient } from "@/lib/supabase/admin";

export type DbRole = {
  id: number;
  name: string;
  label: string;
  rank: number;
  isSuperAdmin: boolean;
};

export type RoutePermissionMatrix = Record<string, Record<string, boolean>>;

const FALLBACK_ROLES: DbRole[] = [
  { id: 0, name: "user", label: "User", rank: 0, isSuperAdmin: false },
  { id: 1, name: "admin", label: "Admin", rank: 50, isSuperAdmin: false },
];

const FALLBACK_MATRIX: RoutePermissionMatrix = {
  dashboard: { user: true, admin: true },
  admin: { admin: true },
  "admin/users": { admin: true },
  "admin/settings": { admin: true },
  settings: { admin: true },
  monitoring: { admin: true },
  tools: { user: true, admin: true },
  "tools/files": { user: true, admin: true },
  "tools/journal": { user: true, admin: true },
  "tools/dispoplaner": { user: true, admin: true },
  "tools/calender": { user: true, admin: true },
  "tools/messages": { user: true, admin: true },
  "tools/storage": { admin: true },
  "tools/system": { admin: true },
  activity: { admin: true },
};

export type PermissionOverview = {
  roles: DbRole[];
  matrix: RoutePermissionMatrix;
};

export function getFallbackOverview(): PermissionOverview {
  return { roles: FALLBACK_ROLES, matrix: FALLBACK_MATRIX };
}

export async function getPermissionOverview(): Promise<PermissionOverview> {
  try {
    const sb = createAdminClient();
    const [{ data: rolesData }, { data: permissionData }] = await Promise.all([
      sb
        .from("roles")
        .select("id, name, label, rank, is_superadmin")
        .order("rank", { ascending: true }),
      sb.from("access_rules").select("role, route, allowed"),
    ]);

    const roles: DbRole[] = Array.isArray(rolesData)
      ? rolesData.map((row) => ({
          id: row.id,
          name: row.name,
          label: row.label ?? row.name,
          rank: typeof row.rank === "number" ? row.rank : 0,
          isSuperAdmin: !!row.is_superadmin,
        }))
      : FALLBACK_ROLES;

    const matrix: RoutePermissionMatrix = {};

    if (Array.isArray(permissionData)) {
      const roleByName = new Map(roles.map((role) => [role.name.toLowerCase(), role]));
      for (const row of permissionData) {
        const roleName = String(row.role ?? "").toLowerCase();
        const role = roleByName.get(roleName);
        if (!role || !row.route) continue;
        const allowed = !!row.allowed;
        if (!matrix[row.route]) {
          matrix[row.route] = {};
        }
        matrix[row.route][role.name] = allowed;
      }
    }

    for (const descriptor of ROUTE_DESCRIPTORS) {
      if (!matrix[descriptor.route]) {
        matrix[descriptor.route] = {};
      }
      for (const role of roles) {
        if (matrix[descriptor.route][role.name] === undefined) {
          matrix[descriptor.route][role.name] = descriptor.defaults?.[role.name] ?? false;
        }
      }
    }

    if (Object.keys(matrix).length === 0) {
      return { roles, matrix: FALLBACK_MATRIX };
    }

    return { roles, matrix };
  } catch (error) {
    console.error("getPermissionOverview", error);
    return getFallbackOverview();
  }
}

export async function checkDatabaseLive(): Promise<DatabaseLiveStatus> {
  try {
    const sb = createAdminClient();
    return await checkDatabaseLiveWithClient(sb);
  } catch (error) {
    console.error("checkDatabaseLive", error);
    return { live: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
