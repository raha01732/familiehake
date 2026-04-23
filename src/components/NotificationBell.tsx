// src/components/NotificationBell.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

type ApiResponse = {
  ok: boolean;
  data?: NotificationRow[];
  unread?: number;
};

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (json.ok) {
        setItems(json.data ?? []);
        setUnread(json.unread ?? 0);
      }
    } catch {
      // best-effort: silence polling errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setItems((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
      );
      setUnread(0);
    } catch {
      // ignore
    }
  }

  async function markOneRead(id: string) {
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((n) =>
          n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      // ignore
    }
  }

  const visible = useMemo(() => items.slice(0, 15), [items]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} ungelesene Benachrichtigungen` : "Benachrichtigungen"}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition hover:brightness-110"
        style={{
          border: "1px solid hsl(var(--border))",
          background: "hsl(var(--secondary))",
          color: "hsl(var(--foreground))",
        }}
      >
        <Bell size={16} strokeWidth={2} aria-hidden />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
            style={{
              background: "hsl(var(--destructive))",
              color: "hsl(var(--destructive-foreground))",
              border: "2px solid hsl(var(--card))",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[340px] overflow-hidden rounded-2xl"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            boxShadow:
              "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 20px 48px -12px rgb(0 0 0 / 0.22)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid hsl(var(--border))" }}
          >
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Benachrichtigungen
            </p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:opacity-40"
              style={{ color: "hsl(var(--primary))" }}
            >
              <CheckCheck size={13} aria-hidden /> Alle gelesen
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Lade…
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Keine Benachrichtigungen.
              </p>
            ) : (
              <ul>
                {visible.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onClick={() => {
                      if (!n.read_at) markOneRead(n.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  n,
  onClick,
}: {
  n: NotificationRow;
  onClick: () => void;
}) {
  const isUnread = !n.read_at;
  const created = formatRelative(n.created_at);
  const Content = (
    <div
      className="flex items-start gap-3 px-4 py-3 transition"
      style={{
        background: isUnread ? "hsl(var(--primary) / 0.05)" : "transparent",
        borderBottom: "1px solid hsl(var(--border))",
      }}
    >
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
        style={{
          background: isUnread ? "hsl(var(--primary))" : "transparent",
          border: isUnread ? "none" : "1px solid hsl(var(--border))",
        }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-semibold"
          style={{ color: "hsl(var(--foreground))" }}
        >
          {n.title}
        </p>
        {n.body && (
          <p
            className="mt-0.5 line-clamp-2 text-xs"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            {n.body}
          </p>
        )}
        <p
          className="mt-1 text-[10px] uppercase tracking-wider"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {created}
        </p>
      </div>
    </div>
  );

  if (n.link) {
    return (
      <li>
        <Link href={n.link} onClick={onClick} className="block hover:brightness-110">
          {Content}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onClick} className="block w-full text-left hover:brightness-110">
        {Content}
      </button>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tg`;
  return new Date(iso).toLocaleDateString("de-DE");
}
