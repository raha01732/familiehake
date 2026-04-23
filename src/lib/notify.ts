// src/lib/notify.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, resolveUserEmail, escapeHtml } from "@/lib/mail";

export type NotificationKind =
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "admin_cron_digest"
  | "system";

type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  /** If provided, adds a prebuilt HTML block to the email. */
  emailHtml?: string;
  /** If provided, adds a plain-text fallback to the email. */
  emailText?: string;
  /** If false, only writes the in-app row and skips email. */
  sendEmail?: boolean;
};

async function userAllowsEmail(userId: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  // Default: opted in.
  return data?.email_enabled !== false;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

function absoluteLink(link: string | null | undefined): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const base = appUrl();
  if (!base) return link;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

function defaultEmailHtml(params: {
  title: string;
  body?: string | null;
  linkAbs: string | null;
}): string {
  const { title, body, linkAbs } = params;
  const bodyHtml = body
    ? `<p style="margin:0 0 16px;color:#333;line-height:1.55">${escapeHtml(body)}</p>`
    : "";
  const linkHtml = linkAbs
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(
        linkAbs
      )}" style="background:#0284c7;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Öffnen</a></p>`
    : "";
  return `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
    <tr><td style="padding:24px">
      <p style="margin:0 0 4px;color:#71717a;font-size:12px;letter-spacing:0.1em;text-transform:uppercase">FamilieHake</p>
      <h1 style="margin:0 0 16px;color:#18181b;font-size:20px">${escapeHtml(title)}</h1>
      ${bodyHtml}
      ${linkHtml}
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Writes an in-app notification row and (optionally) sends an email
 * respecting the user's preferences. Failures on either branch are
 * logged but do not throw — callers should treat notifications as
 * best-effort side effects.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const {
    userId,
    kind,
    title,
    body = null,
    link = null,
    emailHtml,
    emailText,
    sendEmail: allowEmail = true,
  } = input;

  const sb = createAdminClient();
  const { error: insertErr } = await sb.from("notifications").insert({
    user_id: userId,
    kind,
    title,
    body,
    link,
  });
  if (insertErr) {
    console.error("[notify] insert failed:", insertErr.message);
  }

  if (!allowEmail) return;

  try {
    const allowed = await userAllowsEmail(userId);
    if (!allowed) return;

    const to = await resolveUserEmail(userId);
    if (!to) return;

    const linkAbs = absoluteLink(link);
    const html =
      emailHtml ??
      defaultEmailHtml({ title, body, linkAbs });
    const text =
      emailText ??
      [title, body ?? "", linkAbs ?? ""].filter(Boolean).join("\n\n");

    await sendEmail({ to, subject: title, html, text });
  } catch (e) {
    console.error("[notify] email branch failed:", e);
  }
}

/**
 * Convenience wrapper for the most common trigger: a task was assigned
 * to a user. De-dupes so an already-assigned user isn't re-notified
 * on unrelated edits (caller decides the `assignedIds` diff).
 */
export async function notifyTaskAssigned(params: {
  taskId: string;
  taskTitle: string;
  actorUserId: string;
  newAssigneeIds: string[];
}): Promise<void> {
  const { taskId, taskTitle, actorUserId, newAssigneeIds } = params;
  const recipients = Array.from(new Set(newAssigneeIds)).filter(
    (id) => id && id !== actorUserId
  );
  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map((uid) =>
      notify({
        userId: uid,
        kind: "task_assigned",
        title: `Neue Aufgabe: ${taskTitle}`,
        body: "Dir wurde eine Aufgabe im Aufgaben-Board zugewiesen.",
        link: `/tools/tasks?task=${encodeURIComponent(taskId)}`,
      })
    )
  );
}
