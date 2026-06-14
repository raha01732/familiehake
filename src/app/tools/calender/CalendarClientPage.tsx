// src/app/tools/calender/CalendarClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Rss,
} from "lucide-react";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import {
  type CalendarEvent,
  type CalendarView,
  addDays,
  addMonths,
  formatMonthTitle,
  formatWeekTitle,
  getViewRange,
  getWeekDays,
} from "./calendar-utils";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import AgendaView from "./AgendaView";
import EventModal, { type EventInput } from "./EventModal";
import FeedManager, { type CalendarFeed, type FeedInput } from "./FeedManager";

const POLL_MS = 60_000;

type LocalRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  description?: string | null;
};

type ModalState =
  | { mode: "create"; defaultStart: Date | null }
  | { mode: "edit"; event: CalendarEvent }
  | { mode: "view"; event: CalendarEvent }
  | null;

const VIEW_LABELS: { key: CalendarView; label: string }[] = [
  { key: "month", label: "Monat" },
  { key: "week", label: "Woche" },
  { key: "agenda", label: "Agenda" },
];

export default function CalendarClientPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const [feedEvents, setFeedEvents] = useState<CalendarEvent[]>([]);
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [subscribeToken, setSubscribeToken] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [feedManagerOpen, setFeedManagerOpen] = useState(false);

  // ── Datenabruf (stabile Loader, Zeitfenster als Argument) ──────
  const loadLocal = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/events", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setLocalEvents((json.data as LocalRow[]).map((r) => ({ ...r, readOnly: false })));
      }
    } catch {
      /* best effort */
    }
  }, []);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/feeds", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setFeeds(json.data as CalendarFeed[]);
    } catch {
      /* best effort */
    }
  }, []);

  const loadFeedEvents = useCallback(async (from: Date, to: Date) => {
    try {
      const res = await fetch(
        `/api/calendar/feeds/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json?.ok) setFeedEvents(json.data as CalendarEvent[]);
    } catch {
      /* best effort */
    }
  }, []);

  const loadSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/subscription", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setSubscribeToken((json.token as string | null) ?? null);
    } catch {
      /* best effort */
    }
  }, []);

  const reloadFeedEvents = useCallback(() => {
    const { from, to } = getViewRange(view, cursor);
    loadFeedEvents(from, to);
  }, [view, cursor, loadFeedEvents]);

  useEffect(() => {
    void (async () => {
      await loadLocal();
      await loadFeeds();
      await loadSubscription();
    })();
  }, [loadLocal, loadFeeds, loadSubscription]);

  // Externe Events bei Ansicht-/Zeitwechsel + im Intervall (hohe Aktualität).
  useEffect(() => {
    const fetchRange = () => {
      const { from, to } = getViewRange(view, cursor);
      void loadFeedEvents(from, to);
    };
    fetchRange();
    const id = setInterval(fetchRange, POLL_MS);
    return () => clearInterval(id);
  }, [loadFeedEvents, view, cursor]);

  const events = useMemo(() => [...localEvents, ...feedEvents], [localEvents, feedEvents]);

  // ── Event-CRUD ────────────────────────────────────────────────
  const handleEventSubmit = useCallback(
    async (data: EventInput, id?: string) => {
      const payload = {
        title: data.title,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        location: data.location || null,
        description: data.description || null,
      };
      if (id) {
        const res = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error("update failed");
        setLocalEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...(json.data as LocalRow), readOnly: false } : e)),
        );
      } else {
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error("create failed");
        setLocalEvents((prev) => [...prev, { ...(json.data as LocalRow), readOnly: false }]);
      }
      setModal(null);
    },
    [],
  );

  const handleEventDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json();
    if (!json?.ok) throw new Error("delete failed");
    setLocalEvents((prev) => prev.filter((e) => e.id !== id));
    setModal(null);
  }, []);

  // ── Feed-CRUD ─────────────────────────────────────────────────
  const handleFeedAdd = useCallback(
    async (input: FeedInput) => {
      const res = await fetch("/api/calendar/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error("feed add failed");
      setFeeds((prev) => [...prev, json.data as CalendarFeed]);
      reloadFeedEvents();
    },
    [reloadFeedEvents],
  );

  const handleFeedUpdate = useCallback(
    async (id: string, input: Partial<FeedInput>) => {
      const res = await fetch(`/api/calendar/feeds/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error("feed update failed");
      setFeeds((prev) => prev.map((f) => (f.id === id ? (json.data as CalendarFeed) : f)));
      reloadFeedEvents();
    },
    [reloadFeedEvents],
  );

  const handleFeedDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/calendar/feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json?.ok) throw new Error("feed delete failed");
      setFeeds((prev) => prev.filter((f) => f.id !== id));
      setFeedEvents((prev) => prev.filter((e) => e.feedId !== id));
    },
    [],
  );

  const refreshFeeds = useCallback(() => {
    void loadFeeds();
    reloadFeedEvents();
  }, [loadFeeds, reloadFeedEvents]);

  const handleGenerateSubscribe = useCallback(async () => {
    const res = await fetch("/api/calendar/subscription", { method: "POST" });
    const json = await res.json();
    if (!json?.ok) throw new Error("subscribe generate failed");
    setSubscribeToken(json.token as string);
  }, []);

  const handleRevokeSubscribe = useCallback(async () => {
    const res = await fetch("/api/calendar/subscription", { method: "DELETE" });
    const json = await res.json();
    if (!json?.ok) throw new Error("subscribe revoke failed");
    setSubscribeToken(null);
  }, []);

  // ── View-Interaktionen ────────────────────────────────────────
  const onSelectEvent = useCallback((event: CalendarEvent) => {
    setModal(event.readOnly ? { mode: "view", event } : { mode: "edit", event });
  }, []);

  const onCreateAt = useCallback((day: Date) => {
    setModal({ mode: "create", defaultStart: day });
  }, []);

  const onShowDay = useCallback((day: Date) => {
    setCursor(day);
    setView("week");
  }, []);

  function navigate(dir: -1 | 1) {
    setCursor((c) => (view === "month" ? addMonths(c, dir) : addDays(c, dir * 7)));
  }

  const title =
    view === "month"
      ? formatMonthTitle(cursor)
      : view === "week"
        ? formatWeekTitle(getWeekDays(cursor))
        : "Anstehende Termine";

  if (isPreview) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Kalender (Preview)"
          description="Kalendertermine werden in der Preview nicht aus externen Datenquellen geladen."
          fields={["Termine", "Abonnierte Kalender", "Exportdaten"]}
        />
      </section>
    );
  }

  return (
    <section className="animate-fade-up flex flex-col gap-4">
      {/* Kopfzeile */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <CalendarDays size={18} aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Kalender</span>
          </h1>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {view !== "agenda" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Zurück"
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[hsl(var(--secondary))]"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date())}
                className="rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))]"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label="Weiter"
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[hsl(var(--secondary))]"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          )}

          <span className="px-1 text-base font-semibold capitalize" style={{ color: "hsl(var(--foreground))" }}>
            {title}
          </span>

          <div className="flex-1" />

          {/* Ansicht-Umschalter */}
          <div
            className="flex items-center gap-0.5 rounded-lg border p-0.5"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            {VIEW_LABELS.map((v) => {
              const active = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition"
                  style={
                    active
                      ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                      : { color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setFeedManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))]"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            <Rss size={15} aria-hidden />
            <span className="hidden sm:inline">Abos</span>
            {feeds.length > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold"
                style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
              >
                {feeds.length}
              </span>
            )}
          </button>

          <Link
            href="/api/calender/export"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))]"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            <Download size={15} aria-hidden />
            <span className="hidden sm:inline">Export</span>
          </Link>

          <button
            type="button"
            onClick={() => setModal({ mode: "create", defaultStart: null })}
            className="brand-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            <Plus size={15} aria-hidden />
            <span className="hidden sm:inline">Neuer Termin</span>
          </button>
        </div>
      </div>

      {/* Ansicht */}
      <div className="card p-3 sm:p-4">
        {view === "month" && (
          <MonthView
            cursor={cursor}
            events={events}
            onCreateAt={onCreateAt}
            onSelectEvent={onSelectEvent}
            onShowDay={onShowDay}
          />
        )}
        {view === "week" && (
          <WeekView cursor={cursor} events={events} onCreateAt={onCreateAt} onSelectEvent={onSelectEvent} />
        )}
        {view === "agenda" && <AgendaView events={events} onSelectEvent={onSelectEvent} />}
      </div>

      {/* Modals */}
      {modal?.mode === "create" && (
        <EventModal
          mode="create"
          defaultStart={modal.defaultStart}
          onClose={() => setModal(null)}
          onSubmit={handleEventSubmit}
        />
      )}
      {modal?.mode === "edit" && (
        <EventModal
          mode="edit"
          event={modal.event}
          onClose={() => setModal(null)}
          onSubmit={handleEventSubmit}
          onDelete={handleEventDelete}
        />
      )}
      {modal?.mode === "view" && (
        <EventModal mode="view" event={modal.event} onClose={() => setModal(null)} onSubmit={handleEventSubmit} />
      )}

      {feedManagerOpen && (
        <FeedManager
          feeds={feeds}
          subscribeToken={subscribeToken}
          onClose={() => setFeedManagerOpen(false)}
          onAdd={handleFeedAdd}
          onUpdate={handleFeedUpdate}
          onDelete={handleFeedDelete}
          onRefresh={refreshFeeds}
          onGenerateSubscribe={handleGenerateSubscribe}
          onRevokeSubscribe={handleRevokeSubscribe}
        />
      )}
    </section>
  );
}
