import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PERMISSION_LEVELS,
  type PermissionLevel,
  type EffectivePermissions,
  type SessionRole,
  computeEffectivePermissions,
} from "@/lib/rbac";

export type SessionInfo = {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  roles: SessionRole[];
  primaryRole: SessionRole | null;
  permissions: EffectivePermissions;
  isSuperAdmin: boolean;
};

async function assignDefaultRoleIfMissing(
  sb: ReturnType<typeof createAdminClient>,
  userId: string,
  roles: SessionRole[]
): Promise<SessionRole[]> {
  if (roles.length > 0) return roles;

  const { data: member } = await sb
    .from("roles")
    .select("id, name, label, rank, is_superadmin")
    .eq("name", "member")
    .single();

  if (!member) return roles;

  try {
    await sb.from("user_roles").insert({ user_id: userId, role_id: member.id });
  } catch {
    // ignore race conditions
  }

  return [
    {
      id: member.id,
      name: member.name,
      label: member.label ?? member.name,
      rank: typeof member.rank === "number" ? member.rank : 0,
      isSuperAdmin: !!member.is_superadmin,
    },
  ];
}

function mapRoleRow(row: any): SessionRole | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    label: row.label ?? row.name,
    rank: typeof row.rank === "number" ? row.rank : 0,
    isSuperAdmin: !!row.is_superadmin,
  };
}

/** Session + Rollen & Berechtigungen aus Clerk + Supabase holen */
export async function getSessionInfo(): Promise<SessionInfo> {
  const user = await currentUser();
  if (!user) {
    return {
      signedIn: false,
      userId: null,
      email: null,
      roles: [],
      primaryRole: null,
      permissions: {},
      isSuperAdmin: false,
    };
  }

  const sb = createAdminClient();
  const { data: roleRows } = await sb
    .from("user_roles")
    .select("roles(id, name, label, rank, is_superadmin)")
    .eq("user_id", user.id);

  let roles: SessionRole[] =
    roleRows?.map((row) => mapRoleRow((row as any).roles)).filter((r): r is SessionRole => !!r) ?? [];

  roles = await assignDefaultRoleIfMissing(sb, user.id, roles);

  const roleIds = roles.map((r) => r.id);

  let permissions: EffectivePermissions = {};
  if (roleIds.length > 0) {
    const { data: permRows } = await sb
      .from("role_permissions")
      .select("role_id, route, level")
      .in("role_id", roleIds);

    if (Array.isArray(permRows)) {
      permissions = computeEffectivePermissions(permRows as any);
    }
  }

  const primaryRole =
    roles
      .slice()
      .sort((a, b) => b.rank - a.rank)[0] ?? null;

  const isSuperAdmin = roles.some((r) => r.isSuperAdmin);

  return {
    signedIn: true,
    userId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    roles,
    primaryRole,
    permissions,
    isSuperAdmin,
  };
}

export async function getPermissionLevelForRoute(routeKey: string): Promise<PermissionLevel> {
  const session = await getSessionInfo();
  if (!session.signedIn) return PERMISSION_LEVELS.NONE;
  if (session.isSuperAdmin) return PERMISSION_LEVELS.ADMIN;
  return session.permissions[routeKey] ?? PERMISSION_LEVELS.NONE;
}

/** Prüft Zugriff auf einen Route-Key (mindestens Lesen). */
export async function canAccess(
  routeKey: string,
  minimumLevel: PermissionLevel = PERMISSION_LEVELS.READ
): Promise<boolean> {
  const session = await getSessionInfo();
  if (!session.signedIn) return false;
  if (session.isSuperAdmin) return true;
  const level = session.permissions[routeKey] ?? PERMISSION_LEVELS.NONE;
  return level >= minimumLevel;
}

/** Wirft klar definierte Fehler-Codes für RoleGate. */
export async function assertAccessOrThrow(
  routeKey: string,
  minimumLevel: PermissionLevel = PERMISSION_LEVELS.READ
): Promise<void> {
  const session = await getSessionInfo();
  if (!session.signedIn) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }
  if (session.isSuperAdmin) return;
  const allowed = await canAccess(routeKey, minimumLevel);
  if (!allowed) {
    throw new Error("FORBIDDEN_ROLE");
  }
}
