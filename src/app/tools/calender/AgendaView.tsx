// src/app/tools/calender/AgendaView.tsx
"use client";

import { CalendarDays } from "lucide-react";
import {
  type CalendarEvent,
  addDays,
  eventAccent,
  eventEnd,
  eventStart,
  formatDayLong,
  formatTime,
  isSameDay,
  sortEvents,
  startOfDay,
} from "./calendar-utils";

type AgendaViewProps = {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function relativeLabel(day: Date): string | null {
  const today = startOfDay(new Date());
  if (isSameDay(day, today)) return "Heute";
  if (isSameDay(day, addDays(today, 1))) return "Morgen";
  return null;
}

export default function AgendaView({ events, onSelectEvent }: AgendaViewProps) {
  const todayStart = startOfDay(new Date()).getTime();

  const upcoming = events
    .filter((e) => eventEnd(e).getTime() >= todayStart)
    .sort(sortEvents);

  // Nach Starttag gruppieren (Reihenfolge bleibt chronologisch).
  const groups: { day: Date; items: CalendarEvent[] }[] = [];
  const index = new Map<string, number>();
  for (const e of upcoming) {
    const day = startOfDay(eventStart(e));
    const key = dayKey(day);
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push({ day, items: [] });
    }
    groups[i].items.push(e);
  }

  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16 text-center"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
        >
          <CalendarDays size={22} aria-hidden />
        </div>
        <p className="font-medium" style={{ color: "hsl(var(--foreground))" }}>
          Keine anstehenden Termine
        </p>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Neue Termine erscheinen hier automatisch.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ day, items }) => {
        const rel = relativeLabel(day);
        return (
          <div key={dayKey(day)} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {formatDayLong(day)}
              </h3>
              {rel && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
                >
                  {rel}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {items.map((event) => {
                const accent = eventAccent(event);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    className="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-[hsl(var(--primary)/0.4)]"
                    style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card) / 0.6)" }}
                  >
                    <span
                      className="h-9 w-1 flex-shrink-0 rounded-full"
                      style={{ background: accent.solid }}
                      aria-hidden
                    />
                    <div className="w-20 flex-shrink-0 text-xs tabular-nums" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {event.allDay ? "Ganztägig" : `${formatTime(eventStart(event))}–${formatTime(eventEnd(event))}`}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                        {event.title}
                      </div>
                      {(event.location || event.feedName) && (
                        <div className="truncate text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {[event.location, event.feedName ? `${event.feedName} · abonniert` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
