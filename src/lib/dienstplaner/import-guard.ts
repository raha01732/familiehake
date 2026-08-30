// src/lib/dienstplaner/import-guard.ts
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";

/** Import-Funktionen sind Admin/Superadmin vorbehalten (wie die Auto-Planung). */
export async function assertDienstplanImportAdmin() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");
  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isAdmin = role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;
  if (!isAdmin) throw new Error("FORBIDDEN_ADMIN_ONLY");
  return user;
}
