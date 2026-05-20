// /workspace/familiehake/src/lib/audit.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewWriteBlockedError } from "@/lib/supabase/preview-guard";

/**
 * Alle erlaubten Audit-Action-Typen zentral definieren.
 * -> erweitere diese Liste, wenn neue Events dazukommen.
 */
export const AUDIT_ACTIONS = [
  // Auth & Access
  "login_success",
  "access_denied",
  "role_change",

  // E-Mail / Clerk
  "email_verification_sent",
  "primary_email_set",
  "email_add",
  "email_deleted",

  // Files
  "file_upload",
  "file_delete",
  "file_restore",
  "file_move",
  "file_download",
  "file_share_create",
  "file_share_revoke",
  "file_share_access",
  "file_share_access_denied",

  // Folders
  "folder_create",
  "folder_rename",
  "folder_move",
  "folder_delete",
  "folder_restore",


  // Journal
  "journal_create",
  "journal_update",
  "journal_delete",


  // Dashboard
  "dashboard_welcome_update",
  "theme_preference_update",
  "tool_maintenance_enabled",

  // Finance
  "finance_transaction_create",
  "finance_transaction_update",
  "finance_transaction_delete",

  // Vault
  "vault_entry_create",
  "vault_entry_update",
  "vault_entry_delete",

  // Tasks
  "task_create",
  "task_update",
  "task_delete",

  // Nutrition
  "nutrition_favorite_create",
  "nutrition_favorite_delete",

  // Dienstplaner
  "dienstplan_shift_save",
  "dienstplan_shift_delete",
  "dienstplan_shift_move",
  "dienstplan_shift_update",
  "dienstplan_week_copy",
  "dienstplan_month_clear",
  "dienstplan_month_autoplan",
  "dienstplan_employee_create",
  "dienstplan_employee_update",
  "dienstplan_employee_delete",
  "dienstplan_availability_save",
  "dienstplan_availability_clear",
  "dienstplan_pause_rule_save",
  "dienstplan_pause_rule_delete",
  "dienstplan_requirement_save",
  "dienstplan_requirement_delete",
  "dienstplan_shift_track_save",
  "dienstplan_shift_track_delete",
  "dienstplan_special_event_save",
  "dienstplan_special_event_delete",
  "dienstplan_planned_slot_create",
  "dienstplan_planned_slot_delete",
  "dienstplan_planned_slot_assign",
  "dienstplan_preplan_build",
  "dienstplan_planned_slots_autofill",
  "dienstplan_planned_slots_ai_fill",
  "dienstplan_settings_update",

  // Auslassplanung (Kino-Reinigung)
  "auslass_hall_create",
  "auslass_hall_update",
  "auslass_hall_delete",
  "auslass_staff_create",
  "auslass_staff_update",
  "auslass_staff_delete",
  "auslass_staff_move",
  "auslass_show_create",
  "auslass_show_update",
  "auslass_show_delete",
  "auslass_shows_delete_all",
  "auslass_feedback_save",
  "auslass_feedback_archive",
  "auslass_show_plan",
  "auslass_shows_plan_many",
  "auslass_assignments_set",
  "auslass_assignment_remove",
  "auslass_assignments_clear",
  "auslass_archive_clear",
  "auslass_shows_import_fup",
  "auslass_attendees_update",
  "auslass_shows_lock",
  "auslass_shows_unlock",
  "auslass_early_leave_set",
  "auslass_rutsche_plan",

  // Systemnachrichten / Broadcasts
  "system_message_send",
  "system_message_schedule",
  "system_message_draft_save",
  "system_message_delete",
  "system_report_resend",

  // Errors
  "critical_error",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Strukturell typisierter Clerk-User (vermeidet harte Kopplung an den
 * @clerk/nextjs Typ an dieser Stelle). Liefert die Actor-Felder für ein
 * Audit-Event aus einem currentUser()-Objekt.
 */
type ClerkLikeUser =
  | {
      id: string;
      primaryEmailAddressId?: string | null;
      emailAddresses?: Array<{ id: string; emailAddress: string }>;
    }
  | null
  | undefined;

export function actorFromUser(user: ClerkLikeUser): {
  actorUserId: string | null;
  actorEmail: string | null;
} {
  if (!user) return { actorUserId: null, actorEmail: null };
  const list = user.emailAddresses ?? [];
  const primary = list.find((e) => e.id === user.primaryEmailAddressId) ?? list[0];
  return { actorUserId: user.id ?? null, actorEmail: primary?.emailAddress ?? null };
}

export type LogAuditInput = {
  action: AuditAction;
  actorUserId: string | null;
  actorEmail: string | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
};

/**
 * Schreibt ein Audit-Event in die Tabelle `audit_events`.
 * Spalten (Beispiel):
 *  - ts (default now())
 *  - action text
 *  - actor_user_id text null
 *  - actor_email text null
 *  - target text null
 *  - detail jsonb null
 */
export async function logAudit(input: LogAuditInput) {
  const sb = createAdminClient();
  const payload = {
    action: input.action,
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail,
    target: input.target ?? null,
    detail: input.detail ?? null,
  };

  try {
    const { error } = await sb.from("audit_events").insert(payload);
    if (error) {
      // bewusst kein throw: Audit-Fehler sollen die App nicht brechen
      console.error("logAudit insert error:", error.message);
    }
  } catch (error) {
    if (error instanceof PreviewWriteBlockedError) {
      console.warn("logAudit skipped in preview:", error.message);
      return;
    }

    // bewusst kein throw: Audit-Fehler sollen die App nicht brechen
    console.error("logAudit unexpected error:", error);
  }
}
