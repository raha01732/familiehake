// src/lib/rbac.ts

export const PERMISSION_LEVELS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
} as const;

export type PermissionLevel =
  (typeof PERMISSION_LEVELS)[keyof typeof PERMISSION_LEVELS];

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  [PERMISSION_LEVELS.NONE]: "Kein Zugriff",
  [PERMISSION_LEVELS.READ]: "Lesen",
  [PERMISSION_LEVELS.WRITE]: "Schreiben",
  [PERMISSION_LEVELS.ADMIN]: "Admin",
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
  level: number;
  role?: string | null;
  role_id?: number | null;
};

export type EffectivePermissions = Record<string, PermissionLevel>;

export function computeEffectivePermissions(rows: RolePermissionRow[]): EffectivePermissions {
  const result: EffectivePermissions = {};
  for (const row of rows) {
    const level = normalizeLevel(row.level);
    const current = result[row.route] ?? PERMISSION_LEVELS.NONE;
    if (level > current) {
      result[row.route] = level;
    }
  }
  return result;
}

export function normalizeLevel(level: number | null | undefined): PermissionLevel {
  if (typeof level !== "number" || Number.isNaN(level)) return PERMISSION_LEVELS.NONE;
  if (level <= PERMISSION_LEVELS.NONE) return PERMISSION_LEVELS.NONE;
  if (level >= PERMISSION_LEVELS.ADMIN) return PERMISSION_LEVELS.ADMIN;
  if (level >= PERMISSION_LEVELS.WRITE) return PERMISSION_LEVELS.WRITE;
  if (level >= PERMISSION_LEVELS.READ) return PERMISSION_LEVELS.READ;
  return PERMISSION_LEVELS.NONE;
}

export function hasMinimumPermission(
  permissions: EffectivePermissions,
  routeKey: string,
  minimum: PermissionLevel
): boolean {
  const level = permissions[routeKey] ?? PERMISSION_LEVELS.NONE;
  return level >= minimum;
}

export function describeLevel(level: PermissionLevel): string {
  return PERMISSION_LABELS[level] ?? PERMISSION_LABELS[PERMISSION_LEVELS.NONE];
}
