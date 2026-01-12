// src/lib/access-db.ts
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERMISSION_LEVELS,
  type PermissionLevel,
  describeLevel,
  normalizeLevel,
} from "@/lib/rbac";
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";

export type DbRole = {
  id: number;
  name: string;
  label: string;
  rank: number;
  isSuperAdmin: boolean;
};

export type RoutePermissionMatrix = Record<string, Record<string, PermissionLevel>>;

const FALLBACK_ROLES: DbRole[] = [
  { id: 0, name: "user", label: "User", rank: 0, isSuperAdmin: false },
  { id: 1, name: "admin", label: "Admin", rank: 50, isSuperAdmin: false },
];

const FALLBACK_MATRIX: RoutePermissionMatrix = {
  dashboard: { user: PERMISSION_LEVELS.READ, admin: PERMISSION_LEVELS.READ },
  admin: { admin: PERMISSION_LEVELS.READ },
  "admin/users": { admin: PERMISSION_LEVELS.READ },
  "admin/settings": { admin: PERMISSION_LEVELS.ADMIN },
  settings: { admin: PERMISSION_LEVELS.READ },
  monitoring: { admin: PERMISSION_LEVELS.READ },
  tools: { user: PERMISSION_LEVELS.READ, admin: PERMISSION_LEVELS.WRITE },
  "tools/files": { user: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/journal": { user: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/dispoplaner": { user: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/calender": { user: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/messages": { user: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/storage": { admin: PERMISSION_LEVELS.WRITE },
  "tools/system": { admin: PERMISSION_LEVELS.WRITE },
  activity: { admin: PERMISSION_LEVELS.READ },
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
      sb.from("access_rules").select("role, route, level"),
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
        const level = normalizeLevel(row.level ?? 0);
        if (!matrix[row.route]) {
          matrix[row.route] = {};
        }
        const existing = matrix[row.route][role.name] ?? PERMISSION_LEVELS.NONE;
        if (level > existing) {
          matrix[row.route][role.name] = level;
        }
      }
    }

    for (const descriptor of ROUTE_DESCRIPTORS) {
      if (!matrix[descriptor.route]) {
        matrix[descriptor.route] = {};
      }
      for (const role of roles) {
        if (matrix[descriptor.route][role.name] === undefined) {
          matrix[descriptor.route][role.name] = descriptor.defaultLevel;
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

export function levelToLabel(level: PermissionLevel): string {
  return describeLevel(level);
}
