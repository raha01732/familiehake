// src/app/admin/messages/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getSessionInfo, type SessionInfo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail, resolveUserEmail } from "@/lib/mail";
import { dispatchSystemMessage } from "@/lib/system-messages/send";
import {
  normalizeBlocks,
  type SystemMessageAudience,
  type SystemMessageBlock,
  type SystemMessageChannel,
} from "@/lib/system-messages/blocks";
import { buildCronStatusReport, listAdminUserIds } from "@/lib/cron-status-report";

const ADMIN_MESSAGES_PATH = "/admin/messages";

export type SystemMessageInput = {
  id?: string | null;
  title: string;
  blocks: SystemMessageBlock[];
  channels: SystemMessageChannel[];
  audience: SystemMessageAudience;
  recipientIds: string[];
  scheduledAt?: string | null;
};

async function assertAdmin(): Promise<SessionInfo> {
  const session = await getSessionInfo();
  const isAdmin =
    session.isSuperAdmin ||
    session.roles.some((r) => r.rank >= 50 || r.name.toLowerCase() === "admin");
  if (!session.signedIn || !isAdmin) {
    throw new Error("FORBIDDEN_ADMIN_ONLY");
  }
  return session;
}

function sanitizeChannels(channels: SystemMessageChannel[]): SystemMessageChannel[] {
  return Array.from(new Set(channels.filter((c) => c === "email" || c === "inapp")));
}

function validate(input: SystemMessageInput): string | null {
  if (!input.title.trim()) return "Bitte einen Titel angeben.";
  if (sanitizeChannels(input.channels).length === 0) return "Bitte mindestens einen Versandkanal wählen.";
  if (input.audience === "selected" && input.recipientIds.filter(Boolean).length === 0) {
    return "Bitte mindestens einen Empfänger auswählen.";
  }
  if (normalizeBlocks(input.blocks).length === 0) return "Bitte mindestens einen Inhaltsbaustein hinzufügen.";
  return null;
}

/** Legt eine Nachricht an oder aktualisiert sie und gibt die ID zurück. */
async function persistMessage(
  session: SessionInfo,
  input: SystemMessageInput,
  status: "draft" | "scheduled",
  scheduledAt: string | null
): Promise<string> {
  const sb = createAdminClient();
  const audience: SystemMessageAudience = input.audience === "selected" ? "selected" : "all";
  const base = {
    title: input.title.trim(),
    blocks: normalizeBlocks(input.blocks),
    channels: sanitizeChannels(input.channels),
    audience,
    recipient_ids:
      audience === "selected" ? Array.from(new Set(input.recipientIds.filter(Boolean))) : [],
    status,
    scheduled_at: scheduledAt,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    await sb.from("system_messages").update(base).eq("id", input.id);
    return input.id;
  }

  const { data, error } = await sb
    .from("system_messages")
    .insert({ ...base, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert_failed");
  return data.id as string;
}

export async function saveDraftAction(
  input: SystemMessageInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await assertAdmin();
  if (!input.title.trim()) return { ok: false, error: "Bitte einen Titel angeben." };

  try {
    const id = await persistMessage(session, input, "draft", null);
    await logAudit({
      action: "system_message_draft_save",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: id,
      detail: { title: input.title.trim() },
    });
    revalidatePath(ADMIN_MESSAGES_PATH);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "save_failed" };
  }
}

export async function sendSystemMessageNowAction(
  input: SystemMessageInput
): Promise<{ ok: boolean; error?: string; recipientCount?: number; emailSent?: number; inappSent?: number }> {
  const session = await assertAdmin();
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  try {
    const id = await persistMessage(session, input, "draft", null);
    const result = await dispatchSystemMessage(id);
    if (!result.ok) return { ok: false, error: result.error ?? "dispatch_failed" };

    await logAudit({
      action: "system_message_send",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: id,
      detail: {
        title: input.title.trim(),
        recipients: result.recipientCount,
        channels: sanitizeChannels(input.channels).join(", "),
      },
    });
    revalidatePath(ADMIN_MESSAGES_PATH);
    return {
      ok: true,
      recipientCount: result.recipientCount,
      emailSent: result.emailSent,
      inappSent: result.inappSent,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}

export async function scheduleSystemMessageAction(
  input: SystemMessageInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await assertAdmin();
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "Bitte einen gültigen Sendezeitpunkt wählen." };
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return { ok: false, error: "Der Sendezeitpunkt muss in der Zukunft liegen." };
  }

  try {
    const id = await persistMessage(session, input, "scheduled", scheduledAt.toISOString());
    await logAudit({
      action: "system_message_schedule",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: id,
      detail: { title: input.title.trim(), scheduledAt: scheduledAt.toISOString() },
    });
    revalidatePath(ADMIN_MESSAGES_PATH);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "schedule_failed" };
  }
}

export async function deleteSystemMessageAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await assertAdmin();
  if (!id) return { ok: false, error: "id_missing" };

  try {
    const sb = createAdminClient();
    const { data: existing } = await sb
      .from("system_messages")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    await sb.from("system_messages").delete().eq("id", id);
    await logAudit({
      action: "system_message_delete",
      actorUserId: session.userId,
      actorEmail: session.email,
      target: id,
      detail: { title: existing?.title ?? null },
    });
    revalidatePath(ADMIN_MESSAGES_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete_failed" };
  }
}

/**
 * Sendet den Cron-Status-Report erneut. Ohne explizite Empfänger geht er an
 * alle Admins; mit recipientIds an die gewählten Nutzer (sofern E-Mail vorhanden).
 */
export async function resendSystemReportAction(
  recipientIds?: string[]
): Promise<{ ok: boolean; recipients?: number; error?: string }> {
  const session = await assertAdmin();

  try {
    const report = await buildCronStatusReport();

    const targetIds =
      recipientIds && recipientIds.length > 0 ? recipientIds : await listAdminUserIds();
    const emails: string[] = [];
    for (const uid of targetIds) {
      const email = await resolveUserEmail(uid);
      if (email) emails.push(email);
    }
    if (emails.length === 0) return { ok: false, error: "Keine Empfänger mit E-Mail gefunden." };

    const mail = await sendEmail({
      to: emails,
      subject: report.subject,
      html: report.html,
      text: report.text,
    });
    if (!mail.ok) {
      return { ok: false, error: mail.skipped ? "E-Mail-Versand ist nicht konfiguriert." : mail.error };
    }

    await logAudit({
      action: "system_report_resend",
      actorUserId: session.userId,
      actorEmail: session.email,
      detail: { recipients: emails.length },
    });
    revalidatePath(ADMIN_MESSAGES_PATH);
    return { ok: true, recipients: emails.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "resend_failed" };
  }
}
