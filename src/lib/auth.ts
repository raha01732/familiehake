// src/lib/auth.ts
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "member" | "admin" | "superadmin";

export const ROLE_ORDER: AppRole[] = ["member", "admin", "superadmin"];
export const ROLE_RANK: Record<AppRole, number> = {
  member: 0,
  admin: 1,
  superadmin: 2,
};

export type SessionInfo = {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  role: AppRole;
  isSuperAdmin: boolean;
};

/** Session + Rolle aus Clerk holen */
export async function getSessionInfo(): Promise<SessionInfo> {
  const user = await currentUser();
  const role = ((user?.publicMetadata?.role as string) ?? "member") as AppRole;
  return {
    signedIn: !!user,
    userId: user?.id ?? null,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    role,
    isSuperAdmin: role === "superadmin",
  };
}

/**
 * Prüft Zugriff auf einen Route-Key über DB (tools_access.roles).
 * Superadmin hat immer Zugriff.
 */
export async function canAccess(routeKey: string): Promise<boolean> {
  const { signedIn, role, isSuperAdmin } = await getSessionInfo();
  if (!signedIn) return false;
  if (isSuperAdmin) return true; // Bypass

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("tools_access")
    .select("roles")
    .eq("route", routeKey)
    .single();

  if (error || !data) return false;

  // Rollenfeld robust parsen: erlaubt text[] ODER kommagetrennten String
  const dbRoles: string[] = Array.isArray((data as any).roles)
    ? ((data as any).roles as string[])
    : typeof (data as any).roles === "string"
    ? String((data as any).roles)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return dbRoles.includes(role);
}

/**
 * Wirft klar definierte Fehler-Codes, die dein RoleGate bereits behandelt:
 *  - "UNAUTHORIZED_NOT_LOGGED_IN"
 *  - "FORBIDDEN_ROLE"
 */
export async function assertAccessOrThrow(routeKey: string): Promise<void> {
  const { signedIn } = await getSessionInfo();
  if (!signedIn) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }
  const allowed = await canAccess(routeKey);
  if (!allowed) {
    throw new Error("FORBIDDEN_ROLE");
  }
}
