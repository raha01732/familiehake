import { auth, currentUser } from "@clerk/nextjs/server";
import { ACCESS_MAP, UserRole } from "./access-map";

export async function getSessionOrRedirect() {
  const { userId } = auth();

  if (!userId) {
    return { user: null, role: null as UserRole | null };
  }

  const user = await currentUser();

  const role = (user?.publicMetadata?.role as UserRole) || "member";

  return {
    user,
    role
  };
}

// prüft, ob der aktuelle user diese route sehen darf
export async function assertAccessOrThrow(routeKey: string) {
  const { user, role } = await getSessionOrRedirect();

  if (!user || !role) {
    throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  }

  const allowedRoles = ACCESS_MAP[routeKey];

  // kein Eintrag => jede eingeloggte Rolle erlaubt
  if (!allowedRoles) return { user, role };

  if (!allowedRoles.includes(role)) {
    throw new Error("FORBIDDEN_ROLE");
  }

  return { user, role };
}
