import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { ACCESS_MAP, UserRole } from "./access-map";

/**
 * Liefert den aktuellen User + Rolle (aus Clerk publicMetadata).
 * Wenn kein Login vorhanden ist, kommt { user: null, role: null } zurück.
 */
export async function getSessionOrRedirect() {
  const { userId } = auth();
  if (!userId) return { user: null, role: null as UserRole | null };

  const user = await currentUser();

  // ------------------------------------------------------------------------
  // 🧩 TEMPORÄRER BLOCK: Bootstrap-Admin per ENV
  //
  // Zweck: Den ersten Admin manuell bestimmen, falls noch keiner existiert.
  // Danach in Vercel:
  //    INIT_ADMIN_EMAIL=deine.admin@mail.tld
  //
  // Nach erfolgreichem Login als dieser User → Admin-Rolle im /admin/users
  // setzen und diesen Code-Block + ENV-Variable wieder entfernen.
  // ------------------------------------------------------------------------
  const initAdminEmail = process.env.INIT_ADMIN_EMAIL?.toLowerCase();
  const isInitAdmin =
    !!initAdminEmail &&
    user?.emailAddresses?.some(
      (e) => e.emailAddress.toLowerCase() === initAdminEmail
    );
  // ------------------------------------------------------------------------
  // 🧩 ENDE des temporären Blocks
  // ------------------------------------------------------------------------

  const role =
    (user?.publicMetadata?.role as UserRole) ||
    (isInitAdmin ? ("admin" as UserRole) : "member");

  return { user, role };
}

/**
 * Prüft Zugriff auf eine Route anhand der Rolle.
 * Wenn kein User oder unzureichende Rechte → Fehler werfen.
 */
export async function assertAccessOrThrow(routeKey: string) {
  const { user, role } = await getSessionOrRedirect();
  if (!user || !role) throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  const allowed = ACCESS_MAP[routeKey];
  if (!allowed) return { user, role };
  if (!allowed.includes(role)) throw new Error("FORBIDDEN_ROLE");
  return { user, role };
}

/**
 * Admin-Helfer: Rolle eines Nutzers direkt in Clerk aktualisieren.
 */
export async function setUserRole(userId: string, role: UserRole) {
  await (await clerkClient()).users.updateUser(userId, {
    publicMetadata: { role },
  });
}
