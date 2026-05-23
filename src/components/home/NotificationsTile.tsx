"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type ApiResponse = { ok: boolean; data?: NotificationRow[]; unread?: number };

const POLL_MS = 60_000;

/** Body gilt als „lang", wenn er aufklappbar dargestellt werden soll. */
function isLong(body: string): boolean {
  return body.length > 220 || body.split("\n").length > 3;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NotificationsTile() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (json.ok) {
        setItems(json.data ?? []);
        setUnread(json.unread ?? 0);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      // ignore
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
      setUnread(0);
    } catch {
      // ignore
    }
  }, []);

  function toggleExpand(n: NotificationRow) {
    setExpanded((p) => ({ ...p, [n.id]: !p[n.id] }));
    if (!n.read_at) void markRead(n.id);
  }

  return (
    <div className="soft-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <Bell size={14} strokeWidth={2} aria-hidden />
          </span>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Benachrichtigungen
            </h3>
            <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              {unread > 0 ? `· ${unread} ungelesen` : "· Alles gelesen"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unread === 0}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
          style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--primary))" }}
        >
          <CheckCheck size={12} aria-hidden /> Alle gelesen
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p className="py-4 text-center text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Lade…
        </p>
      ) : items.length === 0 ? (
        <p className="py-5 text-center text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Keine Benachrichtigungen.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const unreadItem = !n.read_at;
            const body = n.body ?? "";
            const longBody = isLong(body);
            const isOpen = expanded[n.id] ?? false;
            return (
              <li
                key={n.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: unreadItem ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))",
                  background: unreadItem ? "hsl(var(--primary) / 0.05)" : "hsl(var(--card) / 0.6)",
                }}
              >
                <div className="flex items-start gap-2">
                  {unreadItem && (
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: "hsl(var(--primary))" }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug" style={{ color: "hsl(var(--foreground))" }}>
                      {n.title}
                    </p>

                    {body && (
                      <p
                        className={`mt-1 whitespace-pre-line text-[13px] leading-relaxed ${
                          longBody && !isOpen ? "line-clamp-2" : ""
                        }`}
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        {body}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {formatWhen(n.created_at)}
                      </span>

                      {longBody && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(n)}
                          className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ color: "hsl(var(--primary))" }}
                        >
                          {isOpen ? (
                            <>
                              <ChevronUp size={12} aria-hidden /> Weniger
                            </>
                          ) : (
                            <>
                              <ChevronDown size={12} aria-hidden /> Weiterlesen
                            </>
                          )}
                        </button>
                      )}

                      {n.link && (
                        <Link
                          href={n.link}
                          onClick={() => unreadItem && void markRead(n.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ color: "hsl(var(--primary))" }}
                        >
                          <ExternalLink size={12} aria-hidden /> Öffnen
                        </Link>
                      )}

                      {unreadItem && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          Als gelesen markieren
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
