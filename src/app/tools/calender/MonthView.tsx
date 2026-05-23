// src/app/tools/calender/MonthView.tsx
"use client";

import {
  type CalendarEvent,
  WEEKDAYS_SHORT,
  eventAccent,
  eventsForDay,
  eventStart,
  formatTime,
  getMonthGrid,
  isSameMonth,
  isToday,
  isWeekend,
} from "./calendar-utils";

const MAX_CHIPS = 3;

type MonthViewProps = {
  cursor: Date;
  events: CalendarEvent[];
  onCreateAt: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onShowDay: (day: Date) => void;
};

export default function MonthView({
  cursor,
  events,
  onCreateAt,
  onSelectEvent,
  onShowDay,
}: MonthViewProps) {
  const grid = getMonthGrid(cursor);

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "hsl(var(--border))" }}>
      {/* Wochentags-Kopf */}
      <div className="grid grid-cols-7" style={{ background: "hsl(var(--secondary) / 0.5)" }}>
        {WEEKDAYS_SHORT.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Tageszellen */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          const dayEvents = eventsForDay(events, day);
          const shown = dayEvents.slice(0, MAX_CHIPS);
          const overflow = dayEvents.length - shown.length;

          const createAtDay = () => {
            const at = new Date(day);
            at.setHours(9, 0, 0, 0);
            onCreateAt(at);
          };

          return (
            <div
              key={i}
              onClick={createAtDay}
              className="group flex min-h-[96px] cursor-pointer flex-col gap-1 p-1.5 transition-colors sm:min-h-[116px]"
              style={{
                borderTop: i >= 7 ? "1px solid hsl(var(--border))" : "none",
                borderLeft: i % 7 !== 0 ? "1px solid hsl(var(--border))" : "none",
                background: today
                  ? "hsl(var(--primary) / 0.05)"
                  : inMonth
                    ? isWeekend(day)
                      ? "hsl(var(--secondary) / 0.25)"
                      : "transparent"
                    : "hsl(var(--muted) / 0.25)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                  style={
                    today
                      ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                      : {
                          color: inMonth
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--muted-foreground) / 0.6)",
                        }
                  }
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                {shown.map((event) => (
                  <EventChip key={event.id} event={event} onClick={onSelectEvent} />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDay(day);
                    }}
                    className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:underline"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    +{overflow} mehr
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}) {
  const accent = eventAccent(event);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      title={event.title}
      className="flex items-center gap-1.5 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition hover:brightness-105"
      style={{ background: accent.soft }}
    >
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: accent.solid }}
        aria-hidden
      />
      {!event.allDay && (
        <span className="flex-shrink-0 tabular-nums" style={{ color: "hsl(var(--muted-foreground))" }}>
          {formatTime(eventStart(event))}
        </span>
      )}
      <span className="truncate font-medium" style={{ color: "hsl(var(--foreground))" }}>
        {event.title}
      </span>
    </button>
  );
}
