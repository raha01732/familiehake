// src/components/home/TaskSummaryTile.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { ListChecks, CalendarClock, AlertTriangle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  userId: string;
};

function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type TaskStats = {
  dueToday: number;
  overdue: number;
  openTotal: number;
  hasAssignedAny: boolean;
};

async function loadStats(userId: string): Promise<TaskStats | null> {
  try {
    const sb = createAdminClient();
    const today = berlinToday();

    const { data, error } = await sb
      .from("task_board_tasks")
      .select("status, due_date")
      .eq("assignee_user_id", userId);

    if (error) {
      console.error("[TaskSummaryTile] db error:", error.message);
      return null;
    }

    const rows = data ?? [];
    let dueToday = 0;
    let overdue = 0;
    let openTotal = 0;

    for (const row of rows) {
      if (row.status === "done") continue;
      openTotal++;
      if (!row.due_date) continue;
      if (row.due_date === today) dueToday++;
      else if (row.due_date < today) overdue++;
    }

    return { dueToday, overdue, openTotal, hasAssignedAny: rows.length > 0 };
  } catch (e) {
    console.error("[TaskSummaryTile] load failed:", e);
    return null;
  }
}

export default async function TaskSummaryTile({ userId }: Props) {
  const stats = await loadStats(userId);
  if (!stats) return null;

  const hasAlerts = stats.dueToday > 0 || stats.overdue > 0;

  return (
    <Link
      href="/tools/tasks"
      aria-label="Zum Aufgaben-Board"
      className="feature-card group relative flex flex-col gap-4 overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
      style={{
        border: hasAlerts
          ? "1px solid hsl(var(--primary) / 0.45)"
          : "1px solid hsl(var(--border))",
      }}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{
          background: hasAlerts
            ? "hsl(var(--primary) / 0.18)"
            : "hsl(var(--primary) / 0.08)",
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "hsl(var(--primary) / 0.12)",
            color: "hsl(var(--primary))",
          }}
        >
          <ListChecks size={18} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Aufgaben-Board
          </p>
          <h3
            className="text-base font-semibold"
            style={{ color: "hsl(var(--foreground))" }}
          >
            {hasAlerts ? "Für dich fällig" : "Deine Aufgaben"}
          </h3>
        </div>
      </div>

      {/* Stats */}
      {stats.hasAssignedAny ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Heute fällig"
            value={stats.dueToday}
            accent={stats.dueToday > 0 ? "warn" : "neutral"}
            icon={<CalendarClock size={14} strokeWidth={2.2} aria-hidden />}
          />
          <Stat
            label="Überfällig"
            value={stats.overdue}
            accent={stats.overdue > 0 ? "danger" : "neutral"}
            icon={<AlertTriangle size={14} strokeWidth={2.2} aria-hidden />}
          />
        </div>
      ) : (
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Dir wurden aktuell keine Aufgaben zugewiesen.
        </p>
      )}

      {/* Footer line */}
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        <span>
          {stats.openTotal === 0
            ? "Alles erledigt"
            : `${stats.openTotal} offen insgesamt`}
        </span>
        <span
          className="font-semibold transition-opacity group-hover:opacity-70"
          style={{ color: "hsl(var(--primary))" }}
        >
          Zum Board →
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
  accent: "warn" | "danger" | "neutral";
  icon: ReactNode;
}) {
  const palette =
    accent === "danger"
      ? {
          bg: "hsl(0 72% 55% / 0.08)",
          border: "hsl(0 72% 55% / 0.35)",
          color: "hsl(0 72% 55%)",
        }
      : accent === "warn"
      ? {
          bg: "hsl(32 95% 55% / 0.1)",
          border: "hsl(32 95% 55% / 0.35)",
          color: "hsl(32 95% 55%)",
        }
      : {
          bg: "hsl(var(--muted) / 0.4)",
          border: "hsl(var(--border))",
          color: "hsl(var(--muted-foreground))",
        };

  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-3"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
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
