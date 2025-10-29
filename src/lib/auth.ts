import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "./access-map";
import { getAllowedRoles } from "./access-db";

export async function getSessionOrRedirect() {
  const { userId } = auth();
  if (!userId) return { user: null, role: null as UserRole | null };
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as UserRole) ?? "member";
  return { user, role };
}

export async function assertAccessOrThrow(routeKey: string) {
  const { user, role } = await getSessionOrRedirect();
  if (!user || !role) throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");

  const allowed = await getAllowedRoles(routeKey);
  if (!allowed) return { user, role }; // kein Eintrag => jede eingeloggte Rolle erlaubt

  if (!allowed.includes(role)) throw new Error("FORBIDDEN_ROLE");
  return { user, role };
}

export async function setUserRole(userId: string, role: UserRole) {
  await (await clerkClient()).users.updateUser(userId, {
    publicMetadata: { role }
  });
}
