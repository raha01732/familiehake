import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "member" | "admin" | "superadmin";

// klare Rangfolge
export const ROLE_ORDER: AppRole[] = ["member", "admin", "superadmin"];
export const ROLE_RANK: Record<AppRole, number> = {
  member: 0,
  admin: 1,
  superadmin: 2,
};

export async function getSessionInfo() {
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as AppRole) ?? "member";
  return {
    signedIn: !!user,
    userId: user?.id ?? null,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    role,
    isSuperAdmin: role === "superadmin",
  };
}

// Zugriff aus DB (tools_access), aber Superadmin immer erlauben
export async function canAccess(routeKey: string): Promise<boolean> {
  const { signedIn, role } = await getSessionInfo();
  if (!signedIn) return false;
  if (role === "superadmin") return true;

  const sb = createAdminClient();
  const { data } = await sb.from("tools_access").select("roles").eq("route", routeKey).single();
  if (!data?.roles) return false;

  // roles ist string[] aus DB
  return (data.roles as string[]).includes(role);
}
