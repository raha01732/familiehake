// src/components/home/MessagesSummaryTile.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare, Users as UsersIcon, Mail } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

type Stats = { unread: number; conversations: number };

async function loadStats(userId: string): Promise<Stats | null> {
  try {
    const sb = createAdminClient();

    const [unreadRes, messagesRes] = await Promise.all([
      sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "message_received")
        .is("read_at", null),
      sb
        .from("messages")
        .select("sender_id,recipient_id")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .limit(500),
    ]);

    if (unreadRes.error) {
      console.error("[MessagesSummaryTile] unread error:", unreadRes.error.message);
      return null;
    }
    if (messagesRes.error) {
      console.error("[MessagesSummaryTile] messages error:", messagesRes.error.message);
      return null;
    }

    const peers = new Set<string>();
    for (const row of messagesRes.data ?? []) {
      peers.add(row.sender_id === userId ? row.recipient_id : row.sender_id);
    }

    return { unread: unreadRes.count ?? 0, conversations: peers.size };
  } catch (e) {
    console.error("[MessagesSummaryTile] load failed:", e);
    return null;
  }
}

export default async function MessagesSummaryTile({ userId }: { userId: string }) {
  const stats = await loadStats(userId);
  if (!stats) return null;

  const hasUnread = stats.unread > 0;

  return (
    <Link
      href="/tools/messages"
      aria-label="Zum Nachrichten-Tool"
      className="feature-card group relative flex flex-col gap-4 overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
      style={{
        border: hasUnread ? "1px solid hsl(var(--primary) / 0.45)" : "1px solid hsl(var(--border))",
      }}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{ background: hasUnread ? "hsl(var(--primary) / 0.18)" : "hsl(var(--primary) / 0.08)" }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
        >
          <MessageSquare size={18} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Nachrichten
          </p>
          <h3 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            {hasUnread ? "Neue Nachrichten" : "Deine Nachrichten"}
          </h3>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Ungelesen"
          value={stats.unread}
          accent={hasUnread ? "warn" : "neutral"}
          icon={<Mail size={14} strokeWidth={2.2} aria-hidden />}
        />
        <Stat
          label="Unterhaltungen"
          value={stats.conversations}
          accent="neutral"
          icon={<UsersIcon size={14} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      {/* Footer line */}
      <div className="flex items-center justify-between text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        <span>{hasUnread ? `${stats.unread} noch nicht gelesen` : "Alles gelesen"}</span>
        <span
          className="font-semibold transition-opacity group-hover:opacity-70"
          style={{ color: "hsl(var(--primary))" }}
        >
          Zum Chat →
        </span>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: "warn" | "neutral";
  icon: ReactNode;
}) {
  const palette =
    accent === "warn"
      ? { bg: "hsl(32 95% 55% / 0.1)", border: "hsl(32 95% 55% / 0.35)", color: "hsl(32 95% 55%)" }
      : { bg: "hsl(var(--muted) / 0.4)", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" };

  return (
    <div className="flex flex-col gap-1 rounded-xl p-3" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: palette.color }}
      >
        {icon}
        {label}
      </div>
      <div
        className="text-2xl font-bold leading-none"
        style={{ color: accent === "neutral" ? "hsl(var(--foreground))" : palette.color }}
      >
        {value}
      </div>
    </div>
  );
}
