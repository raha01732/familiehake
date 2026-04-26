"use client";

import { useTransition, useState } from "react";
import type { Employee, SpecialEvent, PlannedSlot } from "../utils";

type Props = {
  date: string;
  employees: Employee[];
  specialEvents: SpecialEvent[];
  plannedSlots: PlannedSlot[];
  onClose: () => void;
  createEventAction: (_fd: FormData) => Promise<void>;
  updateEventAction: (_fd: FormData) => Promise<void>;
  deleteEventAction: (_fd: FormData) => Promise<void>;
  createPlannedSlotAction: (_fd: FormData) => Promise<void>;
  deletePlannedSlotAction: (_fd: FormData) => Promise<void>;
  assignPlannedSlotAction: (_fd: FormData) => Promise<void>;
};

const WEEKDAY_LABELS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function formatDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAY_LABELS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")}.${String(
    d.getUTCMonth() + 1
  ).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

const inputCls =
  "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/0.7)] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] disabled:opacity-60";

export default function DayDetailsModal({
  date,
  employees,
  specialEvents,
  plannedSlots,
  onClose,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  createPlannedSlotAction,
  deletePlannedSlotAction,
  assignPlannedSlotAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function withForm(action: (_fd: FormData) => Promise<void>) {
    return (fd: FormData) =>
      startTransition(async () => {
        setError(null);
        try {
          await action(fd);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
        }
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="font-semibold text-[hsl(var(--foreground))]">{formatDateLabel(date)}</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Sonderveranstaltungen & geplante Slots
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] text-xs border-b border-[hsl(var(--destructive)/0.3)]">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* ── Sonderveranstaltungen ───────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Sonderveranstaltungen</h3>
            {specialEvents.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Noch keine Sonderveranstaltung an diesem Tag.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {specialEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-3 py-2"
                  >
                    <form
                      action={withForm(updateEventAction)}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto_auto] gap-2 items-center"
                    >
                      <input type="hidden" name="id" value={event.id} />
                      <input
                        name="title"
                        defaultValue={event.title}
                        className={inputCls}
                        placeholder="Titel"
                        required
                        disabled={isPending}
                      />
                      <input
                        name="start_time"
                        type="time"
                        defaultValue={event.start_time?.slice(0, 5) ?? ""}
                        className={`${inputCls} w-24`}
                        disabled={isPending}
                      />
                      <input
                        name="end_time"
                        type="time"
                        defaultValue={event.end_time?.slice(0, 5) ?? ""}
                        className={`${inputCls} w-24`}
                        disabled={isPending}
                      />
                      <input
                        name="position"
                        defaultValue={event.position ?? ""}
                        placeholder="Position"
                        className={inputCls}
                        disabled={isPending}
                      />
                      <button
                        type="submit"
                        className="text-xs text-emerald-500 hover:text-emerald-400 px-2 font-medium"
                        disabled={isPending}
                      >
                        Speichern
                      </button>
                      <button
                        type="submit"
                        formAction={withForm(deleteEventAction)}
                        className="text-xs text-[hsl(var(--destructive))] hover:opacity-80 px-2 font-medium"
                        disabled={isPending}
                      >
                        Löschen
                      </button>
                    </form>
                    {event.note && (
                      <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{event.note}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              action={withForm(createEventAction)}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-2 items-center pt-2 border-t border-[hsl(var(--border))]"
            >
              <input type="hidden" name="event_date" value={date} />
              <input
                name="title"
                placeholder="Neue Veranstaltung (z.B. Preview, Privatvorstellung)"
                className={inputCls}
                required
                disabled={isPending}
              />
              <input name="start_time" type="time" className={`${inputCls} w-24`} disabled={isPending} />
              <input name="end_time" type="time" className={`${inputCls} w-24`} disabled={isPending} />
              <input name="position" placeholder="Position (optional)" className={inputCls} disabled={isPending} />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
                disabled={isPending}
              >
                + Veranstaltung
              </button>
            </form>
          </section>

          {/* ── Geplante Slots ──────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Geplante / unbesetzte Slots</h3>
            {plannedSlots.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Keine geplanten Slots. Lege unten manuell einen Slot an oder nutze „Vorplanung erstellen" oben.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {plannedSlots.map((slot) => (
                  <li
                    key={slot.id}
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                      </span>
                      <span className="text-xs text-[hsl(var(--foreground))]">{slot.position ?? "Beliebig"}</span>
                      {slot.note && (
                        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">— {slot.note}</span>
                      )}
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground)/0.7)]">
                        {slot.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={withForm(assignPlannedSlotAction)} className="flex items-center gap-2 flex-1">
                        <input type="hidden" name="id" value={slot.id} />
                        <select
                          name="employee_id"
                          className={`${inputCls} flex-1`}
                          defaultValue=""
                          required
                          disabled={isPending}
                        >
                          <option value="" disabled>
                            Mitarbeiter zuweisen…
                          </option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-xs text-emerald-500 hover:text-emerald-400 px-2 font-medium"
                          disabled={isPending}
                        >
                          Zuweisen
                        </button>
                      </form>
                      <form action={withForm(deletePlannedSlotAction)}>
                        <input type="hidden" name="id" value={slot.id} />
                        <button
                          type="submit"
                          className="text-xs text-[hsl(var(--destructive))] hover:opacity-80 px-2 font-medium"
                          disabled={isPending}
                        >
                          Slot löschen
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={withForm(createPlannedSlotAction)}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-2 items-center pt-2 border-t border-[hsl(var(--border))]"
            >
              <input type="hidden" name="slot_date" value={date} />
              <input
                name="position"
                placeholder="Position (z.B. Service, Projektion)"
                className={inputCls}
                disabled={isPending}
              />
              <input name="start_time" type="time" className={`${inputCls} w-24`} required disabled={isPending} />
              <input name="end_time" type="time" className={`${inputCls} w-24`} required disabled={isPending} />
              <input name="note" placeholder="Notiz" className={inputCls} disabled={isPending} />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
                disabled={isPending}
              >
                + Roter Slot
              </button>
            </form>
          </section>

          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className="text-emerald-500 font-medium">Tipp:</span> Sonderveranstaltungen mit Position + Zeit
            fließen automatisch in die Vorplanung ein. Rote Slots werden vom Auto-Plan oder KI-Assistent besetzt.
            Wird eine Schicht manuell angelegt, die exakt zu einem roten Slot passt (Datum + Start + Ende), wird
            der Slot automatisch entfernt.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[hsl(var(--border))] flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-md transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
