"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  Employee, Shift, Availability, DateRequirement, ShiftTrack,
} from "../utils";
import {
  calculateShiftMinutes, formatMinutesAsHours, getInitials,
  getPrevMonth, getNextMonth, getTodayString,
  type PauseRule,
} from "../utils";
import ShiftModal from "./ShiftModal";
import AutoPlanConfigModal, { type AutoPlanConfig } from "./AutoPlanConfigModal";

type Props = {
  month: string;
  days: string[];
  employees: Employee[];
  shifts: Shift[];
  availability: Availability[];
  requirements: DateRequirement[];
  pauseRules: PauseRule[];
  shiftTracks: ShiftTrack[];
  isAdmin: boolean;
  saveShiftAction: (_fd: FormData) => Promise<void>;
  deleteShiftAction: (_fd: FormData) => Promise<void>;
  moveShiftAction: (_fd: FormData) => Promise<void>;
  saveAvailabilityAction: (_fd: FormData) => Promise<void>;
  autoGenerateAction: (_fd: FormData) => Promise<void>;
  clearMonthAction: (_fd: FormData) => Promise<void>;
};

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const AVAIL_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  F:   { label: "F",   bg: "bg-zinc-700",   text: "text-zinc-400" },
  K:   { label: "K",   bg: "bg-amber-950",  text: "text-amber-400" },
  sp:  { label: "sp",  bg: "bg-blue-950",   text: "text-blue-400" },
  fr:  { label: "fr",  bg: "bg-sky-950",    text: "text-sky-400" },
  fix: { label: "fix", bg: "bg-violet-950", text: "text-violet-400" },
};

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

const AVAIL_OPTIONS = [
  { value: "", label: "Verfügbar" },
  { value: "F",  label: "F – Nicht verfügbar" },
  { value: "K",  label: "K – Krank" },
  { value: "sp", label: "sp – Spätdienst bevorzugt" },
  { value: "fr", label: "fr – Frühdienst bevorzugt" },
];

export default function MonthlyGrid({
  month, days, employees, shifts, availability, requirements,
  pauseRules, shiftTracks, isAdmin,
  saveShiftAction, deleteShiftAction, moveShiftAction, saveAvailabilityAction,
  autoGenerateAction, clearMonthAction,
}: Props) {
  const router = useRouter();
  const today = getTodayString();
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [availMenu, setAvailMenu] = useState<AvailMenuState | null>(null);
  const [showAutoPlanConfig, setShowAutoPlanConfig] = useState(false);
  const [isAutoPlanning, startAutoPlanning] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [_isMoving, startMoving] = useTransition();
  const [moveError, setMoveError] = useState<string | null>(null);
  const dragSource = useRef<{ employeeId: number; date: string } | null>(null);

  // ── Build lookup maps ──────────────────────────────────────────────────────
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

  const reqMap = useMemo(() => {
    const map = new Map<string, DateRequirement>();
    for (const r of requirements) map.set(r.requirement_date, r);
    return map;
  }, [requirements]);

  // ── Per-employee monthly minutes ───────────────────────────────────────────
  const empMonthlyMinutes = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shifts) {
      const mins = calculateShiftMinutes(s.start_time, s.end_time, pauseRules, s.break_minutes);
      if (!mins) continue;
      map.set(s.employee_id, (map.get(s.employee_id) ?? 0) + mins.workMinutes);
    }
    return map;
  }, [shifts, pauseRules]);

  // ── Monthly staffing count per day ─────────────────────────────────────────
  const staffingPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shifts) {
      if (s.start_time && s.end_time) {
        map.set(s.shift_date, (map.get(s.shift_date) ?? 0) + 1);
      }
    }
    return map;
  }, [shifts]);

  // ── Month navigation ───────────────────────────────────────────────────────
  function navigateToMonth(m: string) {
    router.push(`/tools/dienstplaner?month=${m}`);
  }

  // ── Auto plan ─────────────────────────────────────────────────────────────
  function handleAutoGenerate(config: AutoPlanConfig) {
    const fd = new FormData();
    fd.set("month", config.month);
    fd.set("min_shift_hours", String(config.min_shift_hours));
    fd.set("max_shifts_per_week", String(config.max_shifts_per_week));
    fd.set("skip_weekends", config.skip_weekends ? "true" : "false");
    fd.set("respect_availability", config.respect_availability ? "true" : "false");
    fd.set("overwrite_existing", config.overwrite_existing ? "true" : "false");
    startAutoPlanning(async () => {
      await autoGenerateAction(fd);
      setShowAutoPlanConfig(false);
    });
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
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

  // ── Clear month ────────────────────────────────────────────────────────────
  function handleClearMonth() {
    const fd = new FormData();
    fd.set("month", month);
    startClearing(async () => {
      await clearMonthAction(fd);
      setShowClearConfirm(false);
    });
  }

  // ── Availability quick set ─────────────────────────────────────────────────
  function handleAvailSelect(emp: Employee, date: string, value: string) {
    const fd = new FormData();
    fd.set("employee_id", String(emp.id));
    fd.set("availability_date", date);
    fd.set("status", value);
    saveAvailabilityAction(fd).then(() => setAvailMenu(null));
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function renderShiftBlock(emp: Employee, date: string) {
    const shift = shiftMap.get(`${emp.id}-${date}`);
    const avail = availMap.get(`${emp.id}-${date}`);

    if (shift?.start_time && shift?.end_time) {
      const mins = calculateShiftMinutes(shift.start_time, shift.end_time, pauseRules, shift.break_minutes);
      const hours = mins ? formatMinutesAsHours(mins.workMinutes) : null;
      return (
        <div
          draggable
          onDragStart={() => handleDragStart(emp.id, date)}
          onClick={() => setModalState({ employee: emp, date, shift })}
          className="w-full text-left group cursor-grab active:cursor-grabbing"
        >
          <div
            className="rounded-md px-1.5 py-1 text-white text-xs leading-tight group-hover:brightness-110 transition-all select-none"
            style={{ backgroundColor: emp.color }}
          >
            <div className="font-semibold truncate">
              {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
            </div>
            {hours && <div className="opacity-80 text-[10px]">{hours}h</div>}
            {shift.break_minutes != null && (
              <div className="opacity-60 text-[10px]">⏸ {shift.break_minutes}min</div>
            )}
          </div>
        </div>
      );
    }

    if (avail?.status) {
      const cfg = AVAIL_LABELS[avail.status.toLowerCase()] ?? AVAIL_LABELS["F"];
      return (
        <div className="flex items-center justify-center h-full min-h-[36px]">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
            {avail.status === "fix"
              ? `${avail.fixed_start?.slice(0, 5) ?? ""}–${avail.fixed_end?.slice(0, 5) ?? ""}`
              : cfg.label}
          </span>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setModalState({ employee: emp, date, shift: null })}
        className="w-full h-full min-h-[36px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="text-zinc-500 text-lg leading-none">+</span>
      </button>
    );
  }

  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const totalMonthHours = Array.from(empMonthlyMinutes.values()).reduce((s, m) => s + m, 0);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateToMonth(getPrevMonth(month))}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-zinc-100 w-44 text-center capitalize">
            {monthLabel}
          </h2>
          <button
            onClick={() => navigateToMonth(getNextMonth(month))}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => navigateToMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`)}
            className="ml-1 px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 rounded-md transition-colors"
          >
            Heute
          </button>
        </div>

        {/* Summary */}
        <div className="text-xs text-zinc-500 ml-2 hidden sm:block">
          <span className="text-zinc-300">{employees.length}</span> Mitarbeiter
          {" · "}
          <span className="text-zinc-300">{formatMinutesAsHours(totalMonthHours)}h</span> geplant
        </div>

        {/* Admin actions */}
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
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
                  className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-xs rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
                >
                  Monat leeren
                </button>
                <button
                  onClick={() => setShowAutoPlanConfig(true)}
                  disabled={isAutoPlanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-60"
                >
                  {isAutoPlanning ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Plane …
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Auto-Plan
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${200 + days.length * 72}px` }}>
          {/* Day header */}
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="sticky left-0 z-10 bg-zinc-900 w-48 min-w-[192px] px-3 py-2 text-left">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Mitarbeiter</span>
              </th>
              {days.map((day) => {
                const d = new Date(`${day}T00:00:00Z`);
                const wd = d.getUTCDay();
                const isToday = day === today;
                const isWeekend = wd === 0 || wd === 6;
                return (
                  <th
                    key={day}
                    className={`w-[72px] min-w-[72px] px-1 py-2 text-center ${
                      isToday
                        ? "bg-indigo-950/60"
                        : isWeekend
                        ? "bg-zinc-900/40"
                        : ""
                    }`}
                  >
                    <div className={`text-[10px] uppercase tracking-wide ${isWeekend ? "text-zinc-500" : "text-zinc-500"}`}>
                      {WEEKDAY_SHORT[wd]}
                    </div>
                    <div
                      className={`text-sm font-semibold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
                        isToday
                          ? "bg-indigo-500 text-white"
                          : isWeekend
                          ? "text-zinc-400"
                          : "text-zinc-200"
                      }`}
                    >
                      {d.getUTCDate()}
                    </div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-10 bg-zinc-900 w-24 min-w-[96px] px-3 py-2 text-right">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Σ Std</span>
              </th>
            </tr>
          </thead>

          {/* Employee rows */}
          <tbody>
            {employees.map((emp, empIdx) => {
              const monthMins = empMonthlyMinutes.get(emp.id) ?? 0;
              const targetMins = emp.monthly_hours * 60;
              const pct = targetMins > 0 ? Math.min(100, Math.round((monthMins / targetMins) * 100)) : 0;
              const over = targetMins > 0 && monthMins > targetMins;

              return (
                <tr
                  key={emp.id}
                  className={`border-b border-zinc-800/60 ${empIdx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20"}`}
                >
                  {/* Employee info cell */}
                  <td className="sticky left-0 z-10 px-3 py-2 bg-inherit border-r border-zinc-800">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: emp.color }}
                      >
                        {getInitials(emp.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">{emp.name}</div>
                        {emp.position && (
                          <div className="text-xs text-zinc-500 truncate">{emp.position}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Day cells */}
                  {days.map((day) => {
                    const isToday = day === today;
                    const d = new Date(`${day}T00:00:00Z`);
                    const wd = d.getUTCDay();
                    const isWeekend = wd === 0 || wd === 6;
                    return (
                      <td
                        key={day}
                        className={`px-1 py-1 align-top group relative ${
                          isToday
                            ? "bg-indigo-950/20"
                            : isWeekend
                            ? "bg-zinc-900/20"
                            : ""
                        }`}
                        style={{ height: 52 }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(emp.id, day)}
                      >
                        {renderShiftBlock(emp, day)}
                        {/* Right-click for availability */}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setAvailMenu({
                              employee: emp,
                              date: day,
                              current: availMap.get(`${emp.id}-${day}`) ?? null,
                              anchorRect: e.currentTarget.getBoundingClientRect(),
                            });
                          }}
                        />
                      </td>
                    );
                  })}

                  {/* Monthly summary cell */}
                  <td className="sticky right-0 z-10 px-2 py-2 text-right bg-inherit border-l border-zinc-800">
                    <div className={`text-xs font-semibold ${over ? "text-amber-400" : "text-zinc-200"}`}>
                      {formatMinutesAsHours(monthMins)}h
                    </div>
                    {emp.monthly_hours > 0 && (
                      <>
                        <div className="text-[10px] text-zinc-600">/ {emp.monthly_hours}h</div>
                        <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden w-14 ml-auto">
                          <div
                            className={`h-full rounded-full transition-all ${over ? "bg-amber-500" : "bg-indigo-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Requirements footer */}
          <tfoot>
            <tr className="border-t-2 border-zinc-700 bg-zinc-900">
              <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 border-r border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Bedarf</span>
              </td>
              {days.map((day) => {
                const req = reqMap.get(day);
                const target = req?.required_shifts ?? 0;
                const actual = staffingPerDay.get(day) ?? 0;
                const ok = target === 0 || actual >= target;
                return (
                  <td key={day} className="px-1 py-2 text-center">
                    <div className={`text-xs font-semibold ${ok ? "text-zinc-400" : "text-red-400"}`}>
                      {target > 0 ? `${actual}/${target}` : <span className="text-zinc-700">—</span>}
                    </div>
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 bg-zinc-900 border-l border-zinc-800 px-2 py-2 text-right">
                <div className="text-xs text-zinc-500">{employees.length} MA</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Availability context menu ──────────────────────────────────────── */}
      {availMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAvailMenu(null)} />
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[200px]"
            style={{
              top: Math.min(availMenu.anchorRect.bottom + 4, window.innerHeight - 220),
              left: Math.min(availMenu.anchorRect.left, window.innerWidth - 220),
            }}
          >
            <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-400">
              {availMenu.employee.name} · {availMenu.date.slice(8)}.{availMenu.date.slice(5, 7)}.
            </div>
            {AVAIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAvailSelect(availMenu.employee, availMenu.date, opt.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors ${
                  (availMenu.current?.status ?? "") === opt.value ? "text-indigo-400 font-medium" : "text-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Auto-plan config modal ────────────────────────────────────────── */}
      {showAutoPlanConfig && (
        <AutoPlanConfigModal
          month={month}
          onClose={() => setShowAutoPlanConfig(false)}
          onConfirm={handleAutoGenerate}
          isPending={isAutoPlanning}
        />
      )}

      {/* ── Shift modal ────────────────────────────────────────────────────── */}
      {modalState && (
        <ShiftModal
          employee={modalState.employee}
          allEmployees={employees}
          date={modalState.date}
          shift={modalState.shift}
          shiftTracks={shiftTracks}
          onClose={() => setModalState(null)}
          saveAction={saveShiftAction}
          deleteAction={deleteShiftAction}
          moveAction={moveShiftAction}
        />
      )}
    </div>
  );
}
