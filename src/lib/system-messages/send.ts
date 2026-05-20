// src/lib/system-messages/send.ts
// Serverseitige Versand-Logik für Systemnachrichten (E-Mail + In-App).
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mail";
import {
  normalizeBlocks,
  renderEmailHtml,
  renderInApp,
  renderPlainText,
  type SystemMessageBlock,
  type SystemMessageChannel,
} from "@/lib/system-messages/blocks";

export type SystemMessageRow = {
  id: string;
  title: string;
  blocks: unknown;
  channels: string[] | null;
  audience: "all" | "selected";
  recipient_ids: string[] | null;
  status: string;
};

export type DispatchResult = {
  ok: boolean;
  recipientCount: number;
  emailSent: number;
  inappSent: number;
  error?: string;
};

type Recipient = { id: string; email: string | null };

function appUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  return raw ? raw.replace(/\/$/, "") : null;
}

function primaryEmailOf(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
}): string | null {
  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  return primary?.emailAddress ?? null;
}

/** Löst die Empfängerliste (mit primärer E-Mail) für eine Nachricht auf. */
export async function resolveRecipients(
  audience: "all" | "selected",
  recipientIds: string[]
): Promise<Recipient[]> {
  const client = await clerkClient();

  if (audience === "selected") {
    const ids = Array.from(new Set(recipientIds.filter(Boolean)));
    if (ids.length === 0) return [];
    const list = await client.users.getUserList({ userId: ids, limit: Math.min(ids.length, 500) });
    return list.data.map((u) => ({ id: u.id, email: primaryEmailOf(u) }));
  }

  // audience === "all": alle Clerk-Nutzer paginiert laden
  const out: Recipient[] = [];
  const pageSize = 100;
  let offset = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await client.users.getUserList({ limit: pageSize, offset });
    out.push(...page.data.map((u) => ({ id: u.id, email: primaryEmailOf(u) })));
    if (page.data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

/** User-IDs, die E-Mail-Benachrichtigungen deaktiviert haben. */
async function emailOptOutSet(
  sb: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data } = await sb
    .from("notification_preferences")
    .select("user_id, email_enabled")
    .in("user_id", userIds);
  const out = new Set<string>();
  for (const row of (data ?? []) as { user_id: string; email_enabled: boolean }[]) {
    if (row.email_enabled === false) out.add(row.user_id);
  }
  return out;
}

/**
 * Versendet eine bereits gespeicherte Systemnachricht und aktualisiert deren
 * Status/Zähler. Fehler einzelner Empfänger brechen den Gesamtversand nicht ab.
 */
export async function dispatchSystemMessage(messageId: string): Promise<DispatchResult> {
  const sb = createAdminClient();

  const { data: message, error } = await sb
    .from("system_messages")
    .select("id, title, blocks, channels, audience, recipient_ids, status")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message) {
    return { ok: false, recipientCount: 0, emailSent: 0, inappSent: 0, error: "message_not_found" };
  }

  const row = message as SystemMessageRow;
  const blocks: SystemMessageBlock[] = normalizeBlocks(row.blocks);
  const channels = (row.channels ?? []) as SystemMessageChannel[];
  const wantsEmail = channels.includes("email");
  const wantsInApp = channels.includes("inapp");

  try {
    const recipients = await resolveRecipients(row.audience, row.recipient_ids ?? []);
    const recipientIds = recipients.map((r) => r.id);

    let emailSent = 0;
    let inappSent = 0;

    // In-App: ein Datensatz pro Empfänger (Batch-Insert)
    if (wantsInApp && recipientIds.length > 0) {
      const { body, link } = renderInApp(blocks);
      const rows = recipientIds.map((uid) => ({
        user_id: uid,
        kind: "system" as const,
        title: row.title,
        body: body || null,
        link,
      }));
      const { error: insErr, count } = await sb
        .from("notifications")
        .insert(rows, { count: "exact" });
      if (insErr) {
        console.error("[system-message] in-app insert failed:", insErr.message);
      } else {
        inappSent = count ?? rows.length;
      }
    }

    // E-Mail: einzeln versenden (kein Adress-Leak), Opt-out beachten
    if (wantsEmail) {
      const optOut = await emailOptOutSet(sb, recipientIds);
      const html = renderEmailHtml({ title: row.title, blocks, appUrl: appUrl() });
      const text = renderPlainText({ title: row.title, blocks });
      for (const rcpt of recipients) {
        if (!rcpt.email || optOut.has(rcpt.id)) continue;
        const res = await sendEmail({ to: rcpt.email, subject: row.title, html, text });
        if (res.ok) emailSent += 1;
      }
    }

    await sb
      .from("system_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: recipients.length,
        email_sent_count: emailSent,
        inapp_sent_count: inappSent,
        error_message: null,
        qstash_message_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return { ok: true, recipientCount: recipients.length, emailSent, inappSent };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "dispatch_failed";
    await sb
      .from("system_messages")
      .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
      .eq("id", messageId);
    console.error("[system-message] dispatch failed:", e);
    return { ok: false, recipientCount: 0, emailSent: 0, inappSent: 0, error: errMsg };
  }
}
