// /workspace/familiehake/src/lib/audit.ts
import { createAdminClient } from "@/lib/supabase/admin";

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
  "file_download",
  "file_share_create",
  "file_share_revoke",
  "file_share_access",
  "file_share_access_denied",


  // Journal
  "journal_create",
  "journal_update",
  "journal_delete",


  // Dashboard
  "dashboard_welcome_update",
  "theme_preference_update",

  // Errors
  "critical_error",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

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

  const { error } = await sb.from("audit_events").insert(payload);
  if (error) {
    // bewusst kein throw: Audit-Fehler sollen die App nicht brechen
    console.error("logAudit insert error:", error.message);
  }
}
