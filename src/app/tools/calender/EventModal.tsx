// src/app/tools/calender/EventModal.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlignLeft, CalendarClock, MapPin, Trash2, X } from "lucide-react";
import {
  type CalendarEvent,
  eventEnd,
  eventStart,
  formatDayLong,
  formatTime,
  toInputValue,
} from "./calendar-utils";

export type EventInput = {
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  description: string;
};

type Mode = "create" | "edit" | "view";

type EventModalProps = {
  mode: Mode;
  event?: CalendarEvent | null;
  defaultStart?: Date | null;
  onClose: () => void;
  onSubmit: (data: EventInput, id?: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
};

function defaultRange(start: Date | null | undefined): { start: string; end: string } {
  const base = start ? new Date(start) : new Date();
  if (!start) {
    // Auf die nächste volle Stunde runden, wenn kein Tag gewählt wurde.
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
  }
  const end = new Date(base.getTime() + 60 * 60 * 1000);
  return { start: toInputValue(base), end: toInputValue(end) };
}

export default function EventModal({
  mode,
  event,
  defaultStart,
  onClose,
  onSubmit,
  onDelete,
}: EventModalProps) {
  const isView = mode === "view";
  const isEdit = mode === "edit";

  const init = (() => {
    if (event && (isEdit || isView)) {
      return {
        title: event.title,
        start: toInputValue(eventStart(event)),
        end: toInputValue(eventEnd(event)),
        location: event.location ?? "",
        description: event.description ?? "",
      };
    }
    const range = defaultRange(defaultStart);
    return { title: "", start: range.start, end: range.end, location: "", description: "" };
  })();

  const [title, setTitle] = useState(init.title);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [location, setLocation] = useState(init.location);
  const [description, setDescription] = useState(init.description);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isView) titleRef.current?.focus();
  }, [isView]);

  // Endzeit mitziehen, wenn sie vor der Startzeit liegt.
  function handleStartChange(value: string) {
    setStart(value);
    if (end && new Date(end) <= new Date(value)) {
      setEnd(toInputValue(new Date(new Date(value).getTime() + 60 * 60 * 1000)));
    }
  }

  async function handleSubmit() {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Bitte einen Titel angeben.");
      return;
    }
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      setError("Bitte gültige Start- und Endzeit wählen.");
      return;
    }
    if (e < s) {
      setError("Das Ende darf nicht vor dem Beginn liegen.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit(
        {
          title: trimmed,
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          location: location.trim(),
          description: description.trim(),
        },
        event?.id,
      );
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!event?.id || !onDelete) return;
    setBusy(true);
    try {
      await onDelete(event.id);
    } catch {
      setError("Löschen fehlgeschlagen.");
      setBusy(false);
    }
  }

  const heading = isView ? event?.title ?? "Termin" : isEdit ? "Termin bearbeiten" : "Neuer Termin";

  return (
    <div
      className="fixed inset-0 z-[600] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "hsl(var(--background) / 0.6)", backdropFilter: "blur(4px)" }}
      />

      {/* Dialog */}
      <div
        className="card animate-fade-up relative z-10 flex w-full max-w-lg flex-col gap-4 p-5 sm:rounded-2xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            {heading}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition hover:bg-[hsl(var(--secondary))]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {isView ? (
          <ViewBody event={event!} />
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Titel
              </span>
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z. B. Zahnarzttermin"
                className="input-field"
                maxLength={300}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Beginn
                </span>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Ende
                </span>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input-field"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Ort <span style={{ opacity: 0.6 }}>(optional)</span>
              </span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z. B. Praxis Dr. Müller"
                className="input-field"
                maxLength={300}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Beschreibung <span style={{ opacity: 0.6 }}>(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input-field resize-y"
                maxLength={5000}
              />
            </label>

            {error && (
              <p
                className="rounded-lg px-3 py-2 text-xs"
                style={{
                  background: "hsl(var(--destructive) / 0.1)",
                  color: "hsl(var(--destructive))",
                }}
              >
                {error}
              </p>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-1 flex items-center justify-between gap-2">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--destructive)/0.1)] disabled:opacity-50"
              style={{ borderColor: "hsl(var(--destructive) / 0.4)", color: "hsl(var(--destructive))" }}
            >
              <Trash2 size={14} aria-hidden /> Löschen
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-[hsl(var(--secondary))]"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              {isView ? "Schließen" : "Abbrechen"}
            </button>
            {!isView && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                className="brand-button rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {isEdit ? "Speichern" : "Erstellen"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewBody({ event }: { event: CalendarEvent }) {
  const start = eventStart(event);
  const end = eventEnd(event);
  const timeLabel = event.allDay
    ? "Ganztägig"
    : `${formatTime(start)} – ${formatTime(end)} Uhr`;

  return (
    <div className="flex flex-col gap-3">
      {event.feedName && (
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            background: event.color ? `hsl(${event.color} 70% 50% / 0.16)` : "hsl(var(--primary) / 0.12)",
            color: event.color ? `hsl(${event.color} 70% 40%)` : "hsl(var(--primary))",
          }}
        >
          {event.feedName} · abonniert
        </span>
      )}

      <DetailRow icon={<CalendarClock size={15} aria-hidden />}>
        <div className="font-medium" style={{ color: "hsl(var(--foreground))" }}>
          {formatDayLong(start)}
        </div>
        <div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {timeLabel}
        </div>
      </DetailRow>

      {event.location && (
        <DetailRow icon={<MapPin size={15} aria-hidden />}>
          <span style={{ color: "hsl(var(--foreground))" }}>{event.location}</span>
        </DetailRow>
      )}

      {event.description && (
        <DetailRow icon={<AlignLeft size={15} aria-hidden />}>
          <p className="whitespace-pre-wrap text-sm" style={{ color: "hsl(var(--foreground))" }}>
            {event.description}
          </p>
        </DetailRow>
      )}
    </div>
  );
}

function DetailRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0" style={{ color: "hsl(var(--primary))" }}>
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
