// src/app/admin/messages/page.tsx
import RoleGate from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUserDisplayName } from "@/lib/user-display";
import { normalizeBlocks, type SystemMessageBlock } from "@/lib/system-messages/blocks";
import MessagesAdminClient, {
  type DirectoryEntry,
  type HistoryItem,
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

async function loadHistory(): Promise<HistoryItem[]> {
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
  return ((data ?? []) as MessageRow[]).map((row) => ({
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
  }));
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
  const [history, directory] = await Promise.all([loadHistory(), loadDirectory()]);

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
