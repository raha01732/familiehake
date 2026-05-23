// src/app/tools/calender/WeekView.tsx
"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  type CalendarEvent,
  eventAccent,
  eventEnd,
  eventsForDay,
  eventStart,
  formatTime,
  formatWeekdayShort,
  getWeekDays,
  isToday,
  layoutDayEvents,
  startOfDay,
} from "./calendar-utils";

const HOUR_HEIGHT = 44; // px pro Stunde
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GRID_TEMPLATE = "52px repeat(7, minmax(0, 1fr))";

type WeekViewProps = {
  cursor: Date;
  events: CalendarEvent[];
  onCreateAt: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
};

export default function WeekView({ cursor, events, onCreateAt, onSelectEvent }: WeekViewProps) {
  const weekDays = getWeekDays(cursor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  // Beim Öffnen/Wochenwechsel auf den Vormittag scrollen.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [cursor]);

  // Jetzt-Linie minütlich aktualisieren.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hasAllDay = weekDays.some((d) =>
    eventsForDay(events, d).some((e) => e.allDay),
  );

  function handleColumnClick(day: Date, e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = (y / HOUR_HEIGHT) * 60;
    const minutes = Math.min(1410, Math.max(0, Math.round(rawMin / 30) * 30));
    const at = new Date(startOfDay(day).getTime() + minutes * 60_000);
    onCreateAt(at);
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
      {/* Kopf: Wochentage */}
      <div className="grid" style={{ gridTemplateColumns: GRID_TEMPLATE, background: "hsl(var(--secondary) / 0.5)" }}>
        <div />
        {weekDays.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className="border-l px-1 py-2 text-center"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="text-[11px] font-medium uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                {formatWeekdayShort(day)}
              </div>
              <div
                className="mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold"
                style={
                  today
                    ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                    : { color: "hsl(var(--foreground))" }
                }
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ganztägig-Streifen */}
      {hasAllDay && (
        <div
          className="grid border-t"
          style={{ gridTemplateColumns: GRID_TEMPLATE, borderColor: "hsl(var(--border))" }}
        >
          <div className="flex items-center justify-end px-1.5 py-1 text-[10px] uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
            ganztägig
          </div>
          {weekDays.map((day) => {
            const allDay = eventsForDay(events, day).filter((e) => e.allDay);
            return (
              <div key={day.toISOString()} className="flex flex-col gap-0.5 border-l p-1" style={{ borderColor: "hsl(var(--border))" }}>
                {allDay.map((event) => {
                  const accent = eventAccent(event);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      title={event.title}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:brightness-105"
                      style={{ background: accent.soft, color: "hsl(var(--foreground))" }}
                    >
                      {event.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Zeitraster */}
      <div ref={scrollRef} className="overflow-y-auto border-t" style={{ maxHeight: 620, borderColor: "hsl(var(--border))" }}>
        <div className="relative grid" style={{ gridTemplateColumns: GRID_TEMPLATE, height: 24 * HOUR_HEIGHT }}>
          {/* Stunden-Beschriftung */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 text-[10px] tabular-nums"
                style={{ top: h * HOUR_HEIGHT - 6, color: "hsl(var(--muted-foreground))" }}
              >
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Tagesspalten */}
          {weekDays.map((day) => {
            const timed = layoutDayEvents(eventsForDay(events, day).filter((e) => !e.allDay), day);
            const today = isToday(day);
            const nowMin = (now.getTime() - startOfDay(day).getTime()) / 60_000;

            return (
              <div
                key={day.toISOString()}
                onClick={(e) => handleColumnClick(day, e)}
                className="relative cursor-pointer border-l"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                {/* Stundenlinien */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0"
                    style={{ top: h * HOUR_HEIGHT, borderTop: "1px solid hsl(var(--border) / 0.6)" }}
                    aria-hidden
                  />
                ))}

                {/* Jetzt-Linie */}
                {today && nowMin >= 0 && nowMin <= 1440 && (
                  <div
                    className="absolute left-0 right-0 z-10"
                    style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
                    aria-hidden
                  >
                    <div className="relative">
                      <span
                        className="absolute -left-1 -top-1 h-2 w-2 rounded-full"
                        style={{ background: "hsl(var(--destructive))" }}
                      />
                      <div style={{ borderTop: "2px solid hsl(var(--destructive))" }} />
                    </div>
                  </div>
                )}

                {/* Termine */}
                {timed.map((p) => {
                  const accent = eventAccent(p.event);
                  const top = (p.startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(18, ((p.endMin - p.startMin) / 60) * HOUR_HEIGHT - 2);
                  const widthPct = 100 / p.lanes;
                  return (
                    <button
                      key={p.event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(p.event);
                      }}
                      title={p.event.title}
                      className="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left transition hover:brightness-105"
                      style={{
                        top,
                        height,
                        left: `calc(${p.lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: accent.soft,
                        borderLeft: `3px solid ${accent.solid}`,
                      }}
                    >
                      <div className="truncate text-[11px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                        {p.event.title}
                      </div>
                      {height > 30 && (
                        <div className="truncate text-[10px] tabular-nums" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {formatTime(eventStart(p.event))}–{formatTime(eventEnd(p.event))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
