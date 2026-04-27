"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  Employee,
  EmploymentHourDefault,
  Shift,
  Availability,
  ShiftTrack,
  SpecialEvent,
  PlannedSlot,
} from "../utils";
import {
  calculateShiftMinutes,
  calculateUrlaubMinutesByEmployee,
  formatMinutesAsHours,
  getGermanHolidays,
  getInitials,
  getPrevMonth,
  getNextMonth,
  getTodayString,
  sortEmployeesForGrid,
  type PauseRule,
} from "../utils";
import ShiftModal from "./ShiftModal";
import AutoPlanConfigModal, { type AutoPlanConfig } from "./AutoPlanConfigModal";
import EmployeeShiftSummaryModal from "./EmployeeShiftSummaryModal";
import DayDetailsModal from "./DayDetailsModal";

type Props = {
  month: string;
  days: string[];
  employees: Employee[];
  shifts: Shift[];
  availability: Availability[];
  pauseRules: PauseRule[];
  shiftTracks: ShiftTrack[];
  specialEvents: SpecialEvent[];
  plannedSlots: PlannedSlot[];
  employmentHourDefaults: EmploymentHourDefault[];
  isAdmin: boolean;
  aiEnabled: boolean;
  saveShiftAction: (_fd: FormData) => Promise<void>;
  deleteShiftAction: (_fd: FormData) => Promise<void>;
  moveShiftAction: (_fd: FormData) => Promise<void>;
  saveAvailabilityAction: (_fd: FormData) => Promise<void>;
  autoGenerateAction: (_fd: FormData) => Promise<void>;
  clearMonthAction: (_fd: FormData) => Promise<void>;
  buildPreplanAction: (_fd: FormData) => Promise<void>;
  autoFillSlotsAction: (_fd: FormData) => Promise<void>;
  aiFillSlotsAction: (_fd: FormData) => Promise<void>;
  createSpecialEventAction: (_fd: FormData) => Promise<void>;
  updateSpecialEventAction: (_fd: FormData) => Promise<void>;
  deleteSpecialEventAction: (_fd: FormData) => Promise<void>;
  createPlannedSlotAction: (_fd: FormData) => Promise<void>;
  deletePlannedSlotAction: (_fd: FormData) => Promise<void>;
  assignPlannedSlotAction: (_fd: FormData) => Promise<void>;
};

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const AVAIL_BADGE: Record<string, { label: string; cls: string }> = {
  f: { label: "F", cls: "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]" },
  k: { label: "K", cls: "bg-amber-900 text-amber-300" },
  u: { label: "U", cls: "bg-purple-900 text-purple-300" },
  sp: { label: "sp", cls: "bg-blue-900 text-blue-300" },
  fr: { label: "fr", cls: "bg-sky-900 text-sky-300" },
};

const AVAIL_OPTIONS = [
  { value: "", label: "Verfügbar" },
  { value: "F", label: "F – Frei" },
  { value: "U", label: "U – Urlaub" },
  { value: "K", label: "K – Krank" },
  { value: "sp", label: "sp – Spät bevorzugt" },
  { value: "fr", label: "fr – Früh bevorzugt" },
];

type ModalState = {
  employee: Employee;
  date: string;
  shift: Shift | null;
};

type AvailMenuState = {
  employee: Employee;
  date: string;
  current: Availability | null;
  anchorRect: DOMRect;
};

type EmployeeSummaryState = {
  employee: Employee;
};

type DayDetailsState = {
  date: string;
};

export default function MonthlyGrid({
  month,
  days,
  employees,
  shifts,
  availability,
  pauseRules,
  shiftTracks,
  specialEvents,
  plannedSlots,
  employmentHourDefaults,
  isAdmin,
  aiEnabled,
  saveShiftAction,
  deleteShiftAction,
  moveShiftAction,
  saveAvailabilityAction,
  autoGenerateAction,
  clearMonthAction,
  buildPreplanAction,
  autoFillSlotsAction,
  aiFillSlotsAction,
  createSpecialEventAction,
  updateSpecialEventAction,
  deleteSpecialEventAction,
  createPlannedSlotAction,
  deletePlannedSlotAction,
  assignPlannedSlotAction,
}: Props) {
  const router = useRouter();
  const today = getTodayString();
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [availMenu, setAvailMenu] = useState<AvailMenuState | null>(null);
  const [employeeSummary, setEmployeeSummary] = useState<EmployeeSummaryState | null>(null);
  const [dayDetails, setDayDetails] = useState<DayDetailsState | null>(null);
  const [showAutoPlanConfig, setShowAutoPlanConfig] = useState(false);
  const [isAutoPlanning, startAutoPlanning] = useTransition();
  const [isAutoFilling, startAutoFilling] = useTransition();
  const [isAiFilling, startAiFilling] = useTransition();
  const [isBuildingPreplan, startBuildingPreplan] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isMoving, startMoving] = useTransition();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const dragSource = useRef<{ employeeId: number; date: string } | null>(null);

  const sortedEmployees = useMemo(() => sortEmployeesForGrid(employees), [employees]);

  const holidayMap = useMemo(() => {
    const year = Number(month.split("-")[0]) || new Date().getUTCFullYear();
    // Auch das Vorjahr/Nachjahr abdecken, damit Tage am Monatsrand noch Treffer haben
    const map = new Map<string, string>();
    for (const yr of [year - 1, year, year + 1]) {
      for (const [k, v] of getGermanHolidays(yr)) map.set(k, v);
    }
    return map;
  }, [month]);

  // ── Lookup-Maps ────────────────────────────────────────────────────────
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of shifts) map.set(`${s.employee_id}-${s.shift_date}`, s);
    return map;
  }, [shifts]);

  const availMap = useMemo(() => {
    const map = new Map<string, Availability>();
    for (const a of availability) map.set(`${a.employee_id}-${a.availability_date}`, a);
    return map;
  }, [availability]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, SpecialEvent[]>();
    for (const event of specialEvents) {
      const list = map.get(event.event_date) ?? [];
      list.push(event);
      map.set(event.event_date, list);
    }
    return map;
  }, [specialEvents]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, PlannedSlot[]>();
    for (const slot of plannedSlots) {
      if (slot.assigned_employee_id !== null) continue;
      const list = map.get(slot.slot_date) ?? [];
      list.push(slot);
      map.set(slot.slot_date, list);
    }
    return map;
  }, [plannedSlots]);

  const empShiftMinutes = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shifts) {
      const summary = calculateShiftMinutes(s.start_time, s.end_time, pauseRules, s.break_minutes);
      if (!summary) continue;
      map.set(s.employee_id, (map.get(s.employee_id) ?? 0) + summary.workMinutes);
    }
    return map;
  }, [shifts, pauseRules]);

  const empUrlaubMinutes = useMemo(
    () => calculateUrlaubMinutesByEmployee(availability, employees, employmentHourDefaults),
    [availability, employees, employmentHourDefaults]
  );

  // Summe aus Schichten + angerechneter Urlaub pro Mitarbeiter (für Ist/Differenz im Footer)
  const empMonthlyMinutes = useMemo(() => {
    const map = new Map<number, number>();
    for (const [id, mins] of empShiftMinutes) map.set(id, (map.get(id) ?? 0) + mins);
    for (const [id, mins] of empUrlaubMinutes) map.set(id, (map.get(id) ?? 0) + mins);
    return map;
  }, [empShiftMinutes, empUrlaubMinutes]);

  const empAvailCounts = useMemo(() => {
    const map = new Map<number, { f: number; u: number; k: number }>();
    for (const a of availability) {
      const status = (a.status ?? "").toLowerCase();
      const counts = map.get(a.employee_id) ?? { f: 0, u: 0, k: 0 };
      if (status === "f") counts.f += 1;
      else if (status === "u") counts.u += 1;
      else if (status === "k") counts.k += 1;
      map.set(a.employee_id, counts);
    }
    return map;
  }, [availability]);

  // ── Aktionen ───────────────────────────────────────────────────────────
  function navigateToMonth(m: string) {
    router.push(`/tools/dienstplaner?month=${m}`);
  }

  function handleAutoGenerate(config: AutoPlanConfig) {
    const fd = new FormData();
    fd.set("month", config.month);
    fd.set("min_shift_hours", String(config.min_shift_hours));
    fd.set("max_shifts_per_week", String(config.max_shifts_per_week));
    fd.set("skip_weekends", config.skip_weekends ? "true" : "false");
    fd.set("respect_availability", config.respect_availability ? "true" : "false");
    fd.set("overwrite_existing", config.overwrite_existing ? "true" : "false");
    setActionError(null);
    startAutoPlanning(async () => {
      try {
        await autoGenerateAction(fd);
        setShowAutoPlanConfig(false);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Auto-Plan fehlgeschlagen");
      }
    });
  }

  function handleBuildPreplan(overwrite: boolean) {
    const fd = new FormData();
    fd.set("month", month);
    fd.set("overwrite_existing", overwrite ? "true" : "false");
    setActionError(null);
    startBuildingPreplan(async () => {
      try {
        await buildPreplanAction(fd);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Vorplanung fehlgeschlagen");
      }
    });
  }

  function handleAutoFillSlots() {
    const fd = new FormData();
    fd.set("month", month);
    setActionError(null);
    startAutoFilling(async () => {
      try {
        await autoFillSlotsAction(fd);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Auto-Befüllung fehlgeschlagen");
      }
    });
  }

  function handleAiFillSlots() {
    const fd = new FormData();
    fd.set("month", month);
    setActionError(null);
    setAiNotice(null);
    startAiFilling(async () => {
      try {
        await aiFillSlotsAction(fd);
        setAiNotice("KI hat die unbesetzten Slots verarbeitet.");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "KI-Befüllung fehlgeschlagen");
      }
    });
  }

  function handleDragStart(employeeId: number, date: string) {
    dragSource.current = { employeeId, date };
  }

  function handleDrop(targetEmployeeId: number, targetDate: string) {
    const src = dragSource.current;
    dragSource.current = null;
    if (!src || src.employeeId === targetEmployeeId || src.date !== targetDate) return;
    const fd = new FormData();
    fd.set("from_employee_id", String(src.employeeId));
    fd.set("to_employee_id", String(targetEmployeeId));
    fd.set("shift_date", targetDate);
    setMoveError(null);
    startMoving(async () => {
      try {
        await moveShiftAction(fd);
      } catch {
        setMoveError("Schicht konnte nicht verschoben werden.");
      }
    });
  }

  function handleClearMonth() {
    const fd = new FormData();
    fd.set("month", month);
    startClearing(async () => {
      await clearMonthAction(fd);
      setShowClearConfirm(false);
    });
  }

  function handleAvailSelect(emp: Employee, date: string, value: string) {
    const fd = new FormData();
    fd.set("employee_id", String(emp.id));
    fd.set("availability_date", date);
    fd.set("status", value);
    saveAvailabilityAction(fd).then(() => setAvailMenu(null));
  }

  // ── Render: Schicht-Zelle ──────────────────────────────────────────────
  function renderShiftCell(emp: Employee, date: string) {
    const shift = shiftMap.get(`${emp.id}-${date}`);
    const avail = availMap.get(`${emp.id}-${date}`);

    if (shift?.start_time && shift?.end_time) {
      const summary = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules, shift.break_minutes);
      return (
        <button
          type="button"
          draggable
          onDragStart={() => handleDragStart(emp.id, date)}
          onClick={() => setModalState({ employee: emp, date, shift })}
          className="w-full h-full text-left cursor-grab active:cursor-grabbing rounded-sm hover:ring-1 hover:ring-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        >
          <div
            className="px-1 py-0.5 text-[11px] leading-tight text-[hsl(var(--foreground))] rounded-sm"
            style={{ borderLeft: `3px solid ${emp.color}` }}
          >
            <div className="font-medium tabular-nums">{shift.start_time.slice(0, 5)}</div>
            <div className="font-medium tabular-nums">{shift.end_time.slice(0, 5)}</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums">
              {summary ? formatMinutesAsHours(summary.workMinutes) : ""}
            </div>
            {shift.comment && (
              <div className="text-[9px] text-[hsl(var(--muted-foreground))] truncate" title={shift.comment}>
                {shift.comment}
              </div>
            )}
          </div>
        </button>
      );
    }

    if (avail?.status) {
      const cfg = AVAIL_BADGE[avail.status.toLowerCase()] ?? AVAIL_BADGE.f;
      const label =
        avail.status === "fix" && avail.fixed_start && avail.fixed_end
          ? `${avail.fixed_start.slice(0, 5)}–${avail.fixed_end.slice(0, 5)}`
          : cfg.label;
      return (
        <button
          type="button"
          onClick={() => setModalState({ employee: emp, date, shift: null })}
          className="w-full h-full flex items-center justify-center"
        >
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.cls}`}>{label}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setModalState({ employee: emp, date, shift: null })}
        className="w-full h-full opacity-0 hover:opacity-100 focus:opacity-100 flex items-center justify-center text-[hsl(var(--muted-foreground)/0.6)] transition-opacity"
        aria-label="Schicht eintragen"
      >
        +
      </button>
    );
  }

  // ── Render: Bemerkungs-Zelle (Sonderveranstaltungen + offene Slots) ───
  function renderRemarksCell(date: string) {
    const events = eventsByDate.get(date) ?? [];
    const slots = slotsByDate.get(date) ?? [];
    const empty = events.length === 0 && slots.length === 0;
    return (
      <button
        type="button"
        onClick={() => setDayDetails({ date })}
        className="w-full h-full text-left px-2 py-1 text-[10px] leading-tight text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary)/0.5)] transition-colors"
      >
        {empty ? (
          <span className="text-[hsl(var(--muted-foreground)/0.6)]">…</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {events.map((event) => (
              <div key={event.id} className="text-[hsl(var(--foreground))] truncate" title={event.title + (event.note ? ` — ${event.note}` : "")}>
                {event.start_time && (
                  <span className="text-[hsl(var(--muted-foreground))] mr-1 tabular-nums">{event.start_time.slice(0, 5)}</span>
                )}
                {event.title}
              </div>
            ))}
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center gap-1 text-red-300 truncate"
                title={`Unbesetzt: ${slot.position ?? "?"} ${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}${
                  slot.note ? ` (${slot.note})` : ""
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block flex-shrink-0" />
                <span className="tabular-nums">
                  {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                </span>
                <span className="truncate">{slot.position ?? "offen"}</span>
              </div>
            ))}
          </div>
        )}
      </button>
    );
  }

  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const totalOpenSlots = useMemo(
    () => plannedSlots.filter((s) => s.assigned_employee_id === null).length,
    [plannedSlots]
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/0.95)] flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateToMonth(getPrevMonth(month))}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Vorheriger Monat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))] w-44 text-center capitalize">{monthLabel}</h2>
          <button
            onClick={() => navigateToMonth(getNextMonth(month))}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="Nächster Monat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() =>
              navigateToMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`)
            }
            className="ml-1 px-2.5 py-1 text-xs bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] rounded-md transition-colors"
          >
            Heute
          </button>
        </div>

        <div className="text-xs text-[hsl(var(--muted-foreground))] ml-2 hidden sm:block">
          <span className="text-[hsl(var(--foreground))]">{employees.length}</span> Mitarbeiter
          {totalOpenSlots > 0 && (
            <>
              {" · "}
              <span className="text-red-400">{totalOpenSlots}</span> offene Slots
            </>
          )}
        </div>

        {isAdmin && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Schritt 1: Grundgerüst (rote Slots) erzeugen */}
            <button
              onClick={() => handleBuildPreplan(false)}
              disabled={isBuildingPreplan}
              className="px-3 py-1.5 text-xs bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded-lg transition-colors disabled:opacity-50"
              title="Schritt 1: Aus Wochentag-Bedarf + Sonderveranstaltungen werden die offenen, roten Slots des Monats erstellt."
            >
              {isBuildingPreplan ? "Erstelle…" : "1. Vorplanung"}
            </button>

            {/* Schritt 2: Slots besetzen (Auto + optional KI) */}
            {totalOpenSlots > 0 && (
              <>
                <button
                  onClick={handleAutoFillSlots}
                  disabled={isAutoFilling}
                  className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-60"
                  title="Schritt 2: deterministischer Algorithmus verteilt die roten Slots fair auf Mitarbeitende (Soll-Stunden, Verfügbarkeiten, Wochenlimit)."
                >
                  {isAutoFilling ? "Fülle…" : "2. Auto-Plan"}
                </button>
                {aiEnabled && (
                  <button
                    onClick={handleAiFillSlots}
                    disabled={isAiFilling}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium rounded-lg transition-colors disabled:opacity-60"
                    title="Alternativ zu Auto-Plan: KI (Gemini) verteilt die roten Slots — gleiche Regeln, andere Heuristik."
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    {isAiFilling ? "KI plant…" : "2. KI-Plan"}
                  </button>
                )}
              </>
            )}

            {/* Destruktiv */}
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Alle Schichten löschen?</span>
                <button
                  onClick={handleClearMonth}
                  disabled={isClearing}
                  className="px-3 py-1.5 bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  {isClearing ? "…" : "Ja, löschen"}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] text-xs rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 text-xs bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded-lg transition-colors"
              >
                Monat leeren
              </button>
            )}
          </div>
        )}
      </div>

      {/* Workflow-Hinweis für Admins */}
      {isAdmin && (
        <div className="px-4 py-1.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] text-[11px] text-[hsl(var(--muted-foreground))]">
          Workflow: <strong className="text-[hsl(var(--foreground))]">1. Vorplanung</strong> erzeugt rote Slots
          aus Wochentag-Bedarf + Sonderveranstaltungen ·{" "}
          <strong className="text-[hsl(var(--foreground))]">2. Auto-Plan</strong>
          {aiEnabled && <> oder <strong className="text-[hsl(var(--foreground))]">KI-Plan</strong></>} verteilt
          die Slots fair auf Mitarbeitende. Manuelle Schichten, die exakt zu einem Slot passen, entfernen den
          Slot automatisch.
        </div>
      )}

      {(moveError || actionError || aiNotice) && (
        <div
          className={`flex items-center justify-between px-4 py-2 border-b text-sm ${
            moveError || actionError
              ? "bg-red-950 border-red-800 text-red-300"
              : "bg-emerald-950/40 border-emerald-900/40 text-emerald-300"
          }`}
        >
          <span>{moveError ?? actionError ?? aiNotice}</span>
          <button
            type="button"
            onClick={() => {
              setMoveError(null);
              setActionError(null);
              setAiNotice(null);
            }}
            className="ml-4 hover:opacity-80"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: `${480 + sortedEmployees.length * 90}px` }}
        >
          {/* Mitarbeiter-Header */}
          <thead className="sticky top-0 z-20 bg-[hsl(var(--card))]">
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="sticky left-0 z-30 bg-[hsl(var(--card))] w-20 min-w-[80px] px-2 py-2 text-left text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Datum
              </th>
              <th className="sticky left-[80px] z-30 bg-[hsl(var(--card))] w-12 min-w-[48px] px-1 py-2 text-center text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Tag
              </th>
              <th className="sticky left-[128px] z-30 bg-[hsl(var(--card))] w-72 min-w-[280px] px-2 py-2 text-left text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Bemerkung / Slots
              </th>
              {sortedEmployees.map((emp) => (
                <th
                  key={emp.id}
                  className="w-[90px] min-w-[90px] px-1 py-2 text-center align-bottom"
                  style={{ borderTop: `3px solid ${emp.color}` }}
                >
                  <button
                    type="button"
                    onClick={() => setEmployeeSummary({ employee: emp })}
                    className="group flex flex-col items-center gap-1 w-full hover:bg-[hsl(var(--secondary)/0.5)] rounded-md py-1 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: emp.color }}
                    >
                      {getInitials(emp.name)}
                    </div>
                    <div className="text-[11px] font-medium text-[hsl(var(--foreground))] truncate w-full px-1" title={emp.name}>
                      {emp.name.split(" ")[0]}
                    </div>
                    <div className="text-[9px] text-[hsl(var(--muted-foreground))] truncate w-full px-1">
                      {emp.position ?? (emp.position_category ? emp.position_category.charAt(0).toUpperCase() + emp.position_category.slice(1) : "")}
                    </div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          {/* Tag-Zeilen */}
          <tbody>
            {days.map((day) => {
              const d = new Date(`${day}T00:00:00Z`);
              const wd = d.getUTCDay();
              const isToday = day === today;
              const holidayName = holidayMap.get(day);
              const isHoliday = Boolean(holidayName);
              // Donnerstag (wd === 4) markiert den Anfang der Kino-Spielwoche
              const isWeekStart = wd === 4;

              // Hintergrund nach Priorität: Heute > Feiertag > Sonntag > Samstag > Standard
              let rowBg = "bg-[hsl(var(--card))]";
              if (isToday) {
                rowBg = "bg-indigo-950/30";
              } else if (isHoliday) {
                rowBg = "bg-amber-400/15";
              } else if (wd === 0) {
                rowBg = "bg-rose-900/25";
              } else if (wd === 6) {
                rowBg = "bg-rose-500/10";
              }

              const weekStartCls = isWeekStart
                ? "border-t-[3px] border-t-[hsl(var(--primary)/0.6)]"
                : "border-t border-[hsl(var(--border))]/40";

              return (
                <tr key={day} className={`${weekStartCls} ${rowBg}`}>
                  <td
                    className={`sticky left-0 z-10 px-2 py-1 align-top ${rowBg} border-r border-[hsl(var(--border))]/40`}
                  >
                    <div className="text-[11px] font-medium text-[hsl(var(--foreground))] tabular-nums">
                      {String(d.getUTCDate()).padStart(2, "0")}.
                      {String(d.getUTCMonth() + 1).padStart(2, "0")}.
                    </div>
                    <div className="text-[9px] text-[hsl(var(--muted-foreground))] tabular-nums">
                      {d.getUTCFullYear()}
                    </div>
                  </td>
                  <td
                    className={`sticky left-[80px] z-10 px-1 py-1 text-center align-top ${rowBg} border-r border-[hsl(var(--border))]/40`}
                  >
                    <span
                      className={`text-[11px] font-medium ${
                        wd === 0
                          ? "text-rose-300"
                          : wd === 6
                          ? "text-rose-400"
                          : isHoliday
                          ? "text-amber-500"
                          : "text-[hsl(var(--foreground))]"
                      }`}
                    >
                      {WEEKDAY_SHORT[wd]}
                    </span>
                  </td>
                  <td
                    className={`sticky left-[128px] z-10 align-top ${rowBg} border-r border-[hsl(var(--border))]/40`}
                  >
                    {isHoliday && (
                      <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        🎉 {holidayName}
                      </div>
                    )}
                    {renderRemarksCell(day)}
                  </td>
                  {sortedEmployees.map((emp) => (
                    <td
                      key={emp.id}
                      className="px-0.5 py-0.5 align-top relative"
                      style={{ height: 56 }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(emp.id, day)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setAvailMenu({
                          employee: emp,
                          date: day,
                          current: availMap.get(`${emp.id}-${day}`) ?? null,
                          anchorRect: e.currentTarget.getBoundingClientRect(),
                        });
                      }}
                    >
                      {renderShiftCell(emp, day)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* Footer: Soll/Ist/Diff/Urlaub/Krank pro Mitarbeiter */}
          <tfoot className="sticky bottom-0 z-20 bg-[hsl(var(--card))] border-t-2 border-[hsl(var(--border))]">
            {[
              { key: "soll", label: "Soll" },
              { key: "ist", label: "Ist" },
              { key: "diff", label: "Differenz" },
              { key: "urlaub", label: "Urlaub" },
              { key: "krank", label: "Krank" },
            ].map((row) => (
              <tr key={row.key} className="border-t border-[hsl(var(--border))]/60">
                <td className="sticky left-0 z-10 bg-[hsl(var(--card))] px-2 py-1 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]" colSpan={3}>
                  {row.label}
                </td>
                {sortedEmployees.map((emp) => {
                  const sollMin = (emp.monthly_hours ?? 0) * 60;
                  const istMin = empMonthlyMinutes.get(emp.id) ?? 0;
                  const diffMin = istMin - sollMin;
                  const counts = empAvailCounts.get(emp.id) ?? { f: 0, u: 0, k: 0 };
                  let value = "";
                  let cls = "text-[hsl(var(--foreground))]";
                  if (row.key === "soll") {
                    value = `${(emp.monthly_hours ?? 0).toFixed(0)}h`;
                  } else if (row.key === "ist") {
                    value = `${formatMinutesAsHours(istMin)}h`;
                    if (sollMin > 0 && istMin > sollMin) cls = "text-amber-400";
                  } else if (row.key === "diff") {
                    value = `${diffMin >= 0 ? "+" : "-"}${formatMinutesAsHours(Math.abs(diffMin))}h`;
                    cls = diffMin < 0 ? "text-amber-400" : diffMin > 0 ? "text-emerald-400" : "text-[hsl(var(--foreground))]";
                  } else if (row.key === "urlaub") {
                    value = String(counts.u);
                    cls = counts.u > 0 ? "text-purple-300" : "text-[hsl(var(--muted-foreground)/0.6)]";
                  } else if (row.key === "krank") {
                    value = String(counts.k);
                    cls = counts.k > 0 ? "text-amber-400" : "text-[hsl(var(--muted-foreground)/0.6)]";
                  }
                  return (
                    <td key={emp.id} className={`px-1 py-1 text-center text-[11px] tabular-nums ${cls}`}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {/* ── Verfügbarkeits-Kontextmenü ─────────────────────────────────── */}
      {availMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAvailMenu(null)} />
          <div
            className="fixed z-50 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-2xl py-1 min-w-[220px]"
            style={{
              top: Math.min(availMenu.anchorRect.bottom + 4, window.innerHeight - 260),
              left: Math.min(availMenu.anchorRect.left, window.innerWidth - 240),
            }}
          >
            <div className="px-3 py-2 border-b border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))]">
              {availMenu.employee.name} · {availMenu.date.slice(8)}.{availMenu.date.slice(5, 7)}.
            </div>
            {AVAIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAvailSelect(availMenu.employee, availMenu.date, opt.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--secondary))] transition-colors ${
                  (availMenu.current?.status ?? "").toUpperCase() === opt.value.toUpperCase()
                    ? "text-indigo-400 font-medium"
                    : "text-[hsl(var(--foreground))]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {showAutoPlanConfig && (
        <AutoPlanConfigModal
          month={month}
          onClose={() => setShowAutoPlanConfig(false)}
          onConfirm={handleAutoGenerate}
          isPending={isAutoPlanning}
        />
      )}

      {modalState && (
        <ShiftModal
          employee={modalState.employee}
          allEmployees={sortedEmployees}
          date={modalState.date}
          shift={modalState.shift}
          shiftTracks={shiftTracks}
          onClose={() => setModalState(null)}
          saveAction={saveShiftAction}
          deleteAction={deleteShiftAction}
          moveAction={moveShiftAction}
        />
      )}

      {employeeSummary && (
        <EmployeeShiftSummaryModal
          employee={employeeSummary.employee}
          month={month}
          shifts={shifts}
          availability={availability}
          pauseRules={pauseRules}
          employmentHourDefaults={employmentHourDefaults}
          onClose={() => setEmployeeSummary(null)}
        />
      )}

      {dayDetails && (
        <DayDetailsModal
          date={dayDetails.date}
          employees={sortedEmployees}
          specialEvents={eventsByDate.get(dayDetails.date) ?? []}
          plannedSlots={(slotsByDate.get(dayDetails.date) ?? []) as PlannedSlot[]}
          onClose={() => setDayDetails(null)}
          createEventAction={createSpecialEventAction}
          updateEventAction={updateSpecialEventAction}
          deleteEventAction={deleteSpecialEventAction}
          createPlannedSlotAction={createPlannedSlotAction}
          deletePlannedSlotAction={deletePlannedSlotAction}
          assignPlannedSlotAction={assignPlannedSlotAction}
        />
      )}

      {isMoving && (
        <div className="fixed bottom-4 right-4 z-40 px-3 py-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg text-xs text-[hsl(var(--foreground))]">
          Verschiebe…
        </div>
      )}
    </div>
  );
}
