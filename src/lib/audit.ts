import { createAdminClient } from "@/lib/supabase/admin";

type AuditPayload = {
  action: "role_change" | "access_denied" | "login_success";
  actorUserId?: string | null;
  actorEmail?: string | null;
  target?: string | null;
  detail?: Record<string, any> | null;
};

export async function logAudit(p: AuditPayload) {
  try {
    const sb = createAdminClient();
    const { error } = await sb.from("audit_events").insert({
      action: p.action,
      actor_user_id: p.actorUserId ?? null,
      actor_email: p.actorEmail ?? null,
      target: p.target ?? null,
      detail: p.detail ?? null
    });
    if (error) console.error("audit insert error:", error);
  } catch (e) {
    console.error("audit insert exception:", e);
  }
}
