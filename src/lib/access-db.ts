// src/lib/access-db.ts
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERMISSION_LEVELS,
  type PermissionLevel,
  describeLevel,
  normalizeLevel,
} from "@/lib/rbac";

export type DbRole = {
  id: number;
  name: string;
  label: string;
  rank: number;
  isSuperAdmin: boolean;
};

export type RoutePermissionMatrix = Record<string, Record<string, PermissionLevel>>;

const FALLBACK_ROLES: DbRole[] = [
  { id: 0, name: "member", label: "Mitglied", rank: 0, isSuperAdmin: false },
  { id: 1, name: "admin", label: "Admin", rank: 50, isSuperAdmin: false },
  { id: 2, name: "superadmin", label: "Superadmin", rank: 100, isSuperAdmin: true },
];

const FALLBACK_MATRIX: RoutePermissionMatrix = {
  dashboard: { member: PERMISSION_LEVELS.READ, admin: PERMISSION_LEVELS.READ },
  admin: { admin: PERMISSION_LEVELS.READ },
  "admin/users": { admin: PERMISSION_LEVELS.READ },
  "admin/settings": { admin: PERMISSION_LEVELS.READ },
  settings: { admin: PERMISSION_LEVELS.READ },
  monitoring: { admin: PERMISSION_LEVELS.READ },
  tools: { member: PERMISSION_LEVELS.READ, admin: PERMISSION_LEVELS.WRITE },
  "tools/files": { member: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/journal": { member: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
  "tools/dispoplaner": { member: PERMISSION_LEVELS.WRITE, admin: PERMISSION_LEVELS.ADMIN },
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
      sb.from("role_permissions").select("role_id, route, level"),
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
      for (const row of permissionData) {
        const roleId = row.role_id;
        const role = roles.find((r) => r.id === roleId);
        if (!role) continue;
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
