// src/app/admin/messages/page.tsx
import RoleGate from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUserDisplayName } from "@/lib/user-display";
import { normalizeBlocks, type SystemMessageBlock } from "@/lib/system-messages/blocks";
import MessagesAdminClient, {
  type DirectoryEntry,
  type HistoryItem,
  type RecipientStat,
} from "./MessagesAdminClient";
import { Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin | Systemnachrichten" };

type MessageRow = {
  id: string;
  title: string;
  blocks: unknown;
  channels: string[] | null;
  audience: string;
  recipient_ids: string[] | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  email_sent_count: number | null;
  inapp_sent_count: number | null;
  created_at: string;
};

type RecipientRow = {
  message_id: string;
  user_id: string;
  email: string | null;
  email_sent: boolean;
  inapp_sent: boolean;
  opened_at: string | null;
  clicked_at: string | null;
};

async function loadHistory(nameMap: Map<string, string>): Promise<HistoryItem[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("system_messages")
    .select(
      "id, title, blocks, channels, audience, recipient_ids, status, scheduled_at, sent_at, recipient_count, email_sent_count, inapp_sent_count, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[admin/messages] history load error:", error.message);
    return [];
  }

  const rows = (data ?? []) as MessageRow[];
  const ids = rows.map((r) => r.id);

  // Empfänger-Tracking + In-App-Lesestatus gebündelt nachladen
  const recipientsByMsg = new Map<string, RecipientRow[]>();
  const readByKey = new Map<string, string>(); // `${messageId}|${userId}` -> read_at
  if (ids.length > 0) {
    const [{ data: recs }, { data: reads }] = await Promise.all([
      sb
        .from("system_message_recipients")
        .select("message_id, user_id, email, email_sent, inapp_sent, opened_at, clicked_at")
        .in("message_id", ids),
      sb
        .from("notifications")
        .select("system_message_id, user_id, read_at")
        .in("system_message_id", ids),
    ]);
    for (const r of (recs ?? []) as RecipientRow[]) {
      const list = recipientsByMsg.get(r.message_id) ?? [];
      list.push(r);
      recipientsByMsg.set(r.message_id, list);
    }
    for (const n of (reads ?? []) as {
      system_message_id: string;
      user_id: string;
      read_at: string | null;
    }[]) {
      if (n.read_at) readByKey.set(`${n.system_message_id}|${n.user_id}`, n.read_at);
    }
  }

  return rows.map((row) => {
    const stats: RecipientStat[] = (recipientsByMsg.get(row.id) ?? [])
      .map((r) => ({
        userId: r.user_id,
        name: nameMap.get(r.user_id) ?? r.email ?? r.user_id.slice(0, 8),
        emailSent: r.email_sent,
        inappSent: r.inapp_sent,
        openedAt: r.opened_at,
        clickedAt: r.clicked_at,
        inappReadAt: readByKey.get(`${row.id}|${r.user_id}`) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    return {
      id: row.id,
      title: row.title,
      blocks: normalizeBlocks(row.blocks) as SystemMessageBlock[],
      channels: (row.channels ?? []) as ("email" | "inapp")[],
      audience: row.audience === "selected" ? "selected" : "all",
      recipientIds: row.recipient_ids ?? [],
      status: (["draft", "scheduled", "sent", "failed"].includes(row.status)
        ? row.status
        : "draft") as HistoryItem["status"],
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      recipientCount: row.recipient_count ?? 0,
      emailSentCount: row.email_sent_count ?? 0,
      inappSentCount: row.inapp_sent_count ?? 0,
      createdAt: row.created_at,
      recipientStats: stats,
      openedCount: stats.filter((s) => s.openedAt).length,
      clickedCount: stats.filter((s) => s.clickedAt).length,
      inappReadCount: stats.filter((s) => s.inappReadAt).length,
    };
  });
}

async function loadDirectory(): Promise<DirectoryEntry[]> {
  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({ limit: 300, orderBy: "-created_at" });
    return list.data
      .map((u) => ({
        id: u.id,
        displayName: formatUserDisplayName({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) ?? null,
        }),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  } catch (e) {
    console.error("[admin/messages] directory load error:", e);
    return [];
  }
}

export default async function AdminMessagesPage() {
  const directory = await loadDirectory();
  const nameMap = new Map(directory.map((d) => [d.id, d.displayName]));
  const history = await loadHistory(nameMap);

  return (
    <RoleGate routeKey="admin/messages">
      <section className="flex flex-col gap-8 animate-fade-up">
        <div className="flex flex-col gap-3">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <Megaphone size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Admin · Systemnachrichten
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Systemnachrichten</span>
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Ankündigungen gestalten und per E-Mail oder In-App-Benachrichtigung an
              ausgewählte oder alle Mitglieder senden.
            </p>
          </div>
        </div>

        <MessagesAdminClient history={history} directory={directory} />
      </section>
    </RoleGate>
  );
}
