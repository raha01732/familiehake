// src/lib/auth.ts
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type EffectivePermissions,
  type SessionRole,
  computeEffectivePermissions,
} from "@/lib/rbac";
import { env } from "@/lib/env";

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

  const { data: fallbackRole } = await sb
    .from("roles")
    .select("id, name, label, rank, is_superadmin")
    .eq("name", "user")
    .single();

  if (!fallbackRole) return roles;

  try {
    await sb.from("user_roles").insert({ user_id: userId, role_id: fallbackRole.id });
  } catch {
    // ignore race conditions
  }

  return [
    {
      id: fallbackRole.id,
      name: fallbackRole.name,
      label: fallbackRole.label ?? fallbackRole.name,
      rank: typeof fallbackRole.rank === "number" ? fallbackRole.rank : 0,
      isSuperAdmin: !!fallbackRole.is_superadmin,
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

  const roleNames = roles.map((r) => r.name);

  let permissions: EffectivePermissions = {};
  if (roleNames.length > 0) {
    const { data: permRows } = await sb
      .from("access_rules")
      .select("route, allowed, role")
      .in("role", roleNames);

    if (Array.isArray(permRows)) {
      permissions = computeEffectivePermissions(permRows as any);
    }
  }

  const primaryRole =
    roles
      .slice()
      .sort((a, b) => b.rank - a.rank)[0] ?? null;

  const primarySuperAdminId = env().PRIMARY_SUPERADMIN_ID;
  const isSuperAdmin =
    user.id === primarySuperAdminId ||
    roles.some((r) => r.isSuperAdmin || r.name.toLowerCase() === "superadmin");

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

export async function canAccess(routeKey: string): Promise<boolean> {
  const session = await getSessionInfo();
  if (!session.signedIn) return false;
  if (session.isSuperAdmin) return true;
  return session.permissions[routeKey] ?? false;
}

/** Wirft klar definierte Fehler-Codes für RoleGate. */
export async function assertAccessOrThrow(routeKey: string): Promise<void> {
  const session = await getSessionInfo();
  if (!session.signedIn) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }
  if (session.isSuperAdmin) return;
  const allowed = await canAccess(routeKey);
  if (!allowed) {
    throw new Error("FORBIDDEN_ROLE");
  }
}
