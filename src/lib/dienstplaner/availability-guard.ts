// src/lib/dienstplaner/availability-guard.ts
// Verfügbarkeiten im Dienstplaner dürfen Admins/Superadmins immer bearbeiten.
// Zusätzlich können in den Dienstplaner-Einstellungen einzelne Nicht-Admin-
// Benutzer (dienstplan_editors) freigeschaltet werden.
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { createAdminClient } from "@/lib/supabase/admin";

export function isDienstplanAdminRole(
  publicMetadata: Parameters<typeof getRoleFromPublicMetadata>[0],
  userId: string | null | undefined
): boolean {
  const role = getRoleFromPublicMetadata(publicMetadata);
  return role === "admin" || (!!userId && userId === env().PRIMARY_SUPERADMIN_ID);
}

export async function isDienstplanEditor(userId: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("dienstplan_editors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getDienstplanEditorIds(): Promise<Set<string>> {
  const sb = createAdminClient();
  const { data } = await sb.from("dienstplan_editors").select("user_id");
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

/** Admin/Superadmin ODER explizit in dienstplan_editors freigeschaltet. */
export async function assertDienstplanAvailabilityWrite() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED_NOT_LOGGED_IN");

  if (isDienstplanAdminRole(user.publicMetadata, user.id)) return user;

  const editor = await isDienstplanEditor(user.id);
  if (!editor) throw new Error("FORBIDDEN_AVAILABILITY_EDITOR_ONLY");
  return user;
}

export async function canWriteDienstplanAvailability(): Promise<boolean> {
  try {
    await assertDienstplanAvailabilityWrite();
    return true;
  } catch {
    return false;
  }
}
