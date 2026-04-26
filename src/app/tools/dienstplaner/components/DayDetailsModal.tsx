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
  "rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-100 focus:border-cyan-500/70 focus:outline-none";

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
      <div className="relative bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-100">{formatDateLabel(date)}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Sonderveranstaltungen & geplante Slots</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-red-950/40 text-red-300 text-xs border-b border-red-900/40">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* ── Sonderveranstaltungen ───────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-200">Sonderveranstaltungen</h3>
            {specialEvents.length === 0 ? (
              <p className="text-xs text-zinc-500">Noch keine Sonderveranstaltung an diesem Tag.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {specialEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
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
                        className="text-xs text-emerald-500 hover:text-emerald-400 px-2"
                        disabled={isPending}
                      >
                        Speichern
                      </button>
                      <button
                        type="submit"
                        formAction={withForm(deleteEventAction)}
                        className="text-xs text-red-500 hover:text-red-400 px-2"
                        disabled={isPending}
                      >
                        Löschen
                      </button>
                    </form>
                    {event.note && (
                      <div className="mt-1 text-[11px] text-zinc-500">{event.note}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              action={withForm(createEventAction)}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-2 items-center pt-2 border-t border-zinc-800"
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
              <input
                name="position"
                placeholder="Position (optional)"
                className={inputCls}
                disabled={isPending}
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1 rounded-md disabled:opacity-50"
                disabled={isPending}
              >
                + Veranstaltung
              </button>
            </form>
          </section>

          {/* ── Geplante Slots ──────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-200">Geplante / unbesetzte Slots</h3>
            {plannedSlots.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Keine geplanten Slots. Lege unten manuell einen Slot an oder nutze „Vorplanung erstellen" oben.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {plannedSlots.map((slot) => (
                  <li
                    key={slot.id}
                    className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs text-red-300">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                      </span>
                      <span className="text-xs text-zinc-300">{slot.position ?? "Beliebig"}</span>
                      {slot.note && <span className="text-[11px] text-zinc-500">— {slot.note}</span>}
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-zinc-600">
                        {slot.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={withForm(assignPlannedSlotAction)} className="flex items-center gap-2">
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
                          className="text-xs text-emerald-500 hover:text-emerald-400 px-2"
                          disabled={isPending}
                        >
                          Zuweisen
                        </button>
                      </form>
                      <form action={withForm(deletePlannedSlotAction)}>
                        <input type="hidden" name="id" value={slot.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-400 px-2"
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
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-2 items-center pt-2 border-t border-zinc-800"
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
              <input
                name="note"
                placeholder="Notiz"
                className={inputCls}
                disabled={isPending}
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1 rounded-md disabled:opacity-50"
                disabled={isPending}
              >
                + Roter Slot
              </button>
            </form>
          </section>

          {/* hint */}
          <p className="text-[11px] text-zinc-500">
            <span className="text-emerald-400 font-medium">Tipp:</span> Sonderveranstaltungen mit Position +
            Zeit fließen automatisch in die Vorplanung ein. Rote Slots werden vom Auto-Plan oder KI-Assistent
            besetzt.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
