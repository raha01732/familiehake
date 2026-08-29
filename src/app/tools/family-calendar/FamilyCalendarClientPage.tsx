"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import {
  type CalendarEvent,
  type CalendarView,
  addDays,
  addMonths,
  formatMonthTitle,
  formatWeekTitle,
  getWeekDays,
} from "@/app/tools/calender/calendar-utils";
import MonthView from "@/app/tools/calender/MonthView";
import WeekView from "@/app/tools/calender/WeekView";
import AgendaView from "@/app/tools/calender/AgendaView";
import EventModal, { type EventInput } from "@/app/tools/calender/EventModal";

type ModalState = { mode: "create"; defaultStart: Date | null } | { mode: "edit"; event: CalendarEvent } | null;

const VIEW_LABELS: { key: CalendarView; label: string }[] = [
  { key: "month", label: "Monat" },
  { key: "week", label: "Woche" },
  { key: "agenda", label: "Agenda" },
];

export default function FamilyCalendarClientPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modal, setModal] = useState<ModalState>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/family-calendar/events", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setEvents(json.data as CalendarEvent[]);
    } catch {
      /* best effort */
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(loadEvents, 0);
    return () => clearTimeout(id);
  }, [loadEvents]);

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
        const res = await fetch(`/api/family-calendar/events/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error("update failed");
        setEvents((prev) => prev.map((e) => (e.id === id ? (json.data as CalendarEvent) : e)));
      } else {
        const res = await fetch("/api/family-calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json?.ok) throw new Error("create failed");
        setEvents((prev) => [...prev, json.data as CalendarEvent]);
      }
      setModal(null);
    },
    [],
  );

  const handleEventDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/family-calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json();
    if (!json?.ok) throw new Error("delete failed");
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModal(null);
  }, []);

  const onSelectEvent = useCallback((event: CalendarEvent) => {
    setModal({ mode: "edit", event });
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
          title="Geteilter Kalender (Preview)"
          description="Termine werden in der Preview nicht geladen."
          fields={["Termine"]}
        />
      </section>
    );
  }

  return (
    <section className="animate-fade-up flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <CalendarDays size={18} aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Geteilter Kalender</span>
          </h1>
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
          >
            <Users size={11} aria-hidden /> Family
          </span>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Jeder mit Zugriff auf den Family-Bereich sieht und bearbeitet dieselben Termine.
        </p>

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

          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "hsl(var(--border))" }}>
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
            onClick={() => setModal({ mode: "create", defaultStart: null })}
            className="brand-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            <Plus size={15} aria-hidden />
            <span className="hidden sm:inline">Neuer Termin</span>
          </button>
        </div>
      </div>

      <div className="card p-3 sm:p-4">
        {view === "month" && (
          <MonthView cursor={cursor} events={events} onCreateAt={onCreateAt} onSelectEvent={onSelectEvent} onShowDay={onShowDay} />
        )}
        {view === "week" && (
          <WeekView cursor={cursor} events={events} onCreateAt={onCreateAt} onSelectEvent={onSelectEvent} />
        )}
        {view === "agenda" && <AgendaView events={events} onSelectEvent={onSelectEvent} />}
      </div>

      {modal?.mode === "create" && (
        <EventModal mode="create" defaultStart={modal.defaultStart} onClose={() => setModal(null)} onSubmit={handleEventSubmit} />
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
    </section>
  );
}
