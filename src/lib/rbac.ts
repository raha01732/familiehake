// src/lib/rbac.ts
export const ACCESS_LABELS = {
  allowed: "Zugriff",
  denied: "Kein Zugriff",
};

export type SessionRole = {
  id: number;
  name: string;
  label: string;
  rank: number;
  isSuperAdmin: boolean;
};

export type RolePermissionRow = {
  route: string;
  allowed: boolean;
  role?: string | null;
  role_id?: number | null;
};

export type EffectivePermissions = Record<string, boolean>;

export function computeEffectivePermissions(rows: RolePermissionRow[]): EffectivePermissions {
  const result: EffectivePermissions = {};
  for (const row of rows) {
    const current = result[row.route] ?? false;
    result[row.route] = current || !!row.allowed;
  }
  return result;
}
