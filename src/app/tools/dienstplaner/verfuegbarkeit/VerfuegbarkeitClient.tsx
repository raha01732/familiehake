"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Availability, Employee } from "../utils";
import { getInitials, getNextMonth, getPrevMonth, getTodayString, sortEmployeesForGrid } from "../utils";

type Props = {
  month: string;
  days: string[];
  employees: Employee[];
  availability: Availability[];
  isAdmin: boolean;
  saveAvailabilityAction: (_fd: FormData) => Promise<void>;
  clearMonthAvailabilityAction: (_fd: FormData) => Promise<void>;
};

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const STATUS_OPTIONS: { value: string; label: string; help: string; cls: string }[] = [
  { value: "", label: "—", help: "Verfügbar", cls: "bg-transparent text-[hsl(var(--muted-foreground))]" },
  { value: "F", label: "F", help: "Frei", cls: "bg-zinc-500/20 text-zinc-300" },
  { value: "U", label: "U", help: "Urlaub", cls: "bg-purple-500/20 text-purple-400" },
  { value: "K", label: "K", help: "Krank", cls: "bg-amber-500/20 text-amber-400" },
  { value: "fr", label: "fr", help: "Frühdienst bevorzugt", cls: "bg-sky-500/20 text-sky-400" },
  { value: "sp", label: "sp", help: "Spätdienst bevorzugt", cls: "bg-blue-500/20 text-blue-400" },
  { value: "fix", label: "fix", help: "Feste Zeiten (separat eintragen)", cls: "bg-violet-500/20 text-violet-400" },
];

function statusCls(value: string | null | undefined) {
  const v = (value ?? "").toLowerCase();
  return STATUS_OPTIONS.find((o) => o.value.toLowerCase() === v) ?? STATUS_OPTIONS[0];
}

export default function VerfuegbarkeitClient({
  month,
  days,
  employees,
  availability,
  isAdmin,
  saveAvailabilityAction,
  clearMonthAvailabilityAction,
}: Props) {
  const router = useRouter();
  const today = getTodayString();
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState("U");
  const [bulkFrom, setBulkFrom] = useState(`${month}-01`);
  const [bulkTo, setBulkTo] = useState(`${month}-01`);
  const [bulkEmployeeId, setBulkEmployeeId] = useState<number | "">("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, startClearing] = useTransition();
  const [saveFlash, setSaveFlash] = useState<string | null>(null);

  function flashSuccess(message: string) {
    setSaveFlash(message);
    setTimeout(() => setSaveFlash((current) => (current === message ? null : current)), 5000);
  }

  function handleClearMonth() {
    if (!isAdmin) return;
    const fd = new FormData();
    fd.set("month", month);
    setSaveError(null);
    startClearing(async () => {
      try {
        await clearMonthAvailabilityAction(fd);
        setShowClearConfirm(false);
        flashSuccess("Verfügbarkeiten gelöscht");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
      }
    });
  }

  const sortedEmployees = useMemo(() => sortEmployeesForGrid(employees), [employees]);

  const availMap = useMemo(() => {
    const map = new Map<string, Availability>();
    for (const entry of availability) {
      map.set(`${entry.employee_id}-${entry.availability_date}`, entry);
    }
    return map;
  }, [availability]);

  const counts = useMemo(() => {
    const map = new Map<number, { f: number; u: number; k: number; fr: number; sp: number; fix: number }>();
    for (const entry of availability) {
      const c = map.get(entry.employee_id) ?? { f: 0, u: 0, k: 0, fr: 0, sp: 0, fix: 0 };
      const key = (entry.status ?? "").toLowerCase();
      if (key === "f") c.f += 1;
      else if (key === "u") c.u += 1;
      else if (key === "k") c.k += 1;
      else if (key === "fr") c.fr += 1;
      else if (key === "sp") c.sp += 1;
      else if (key === "fix") c.fix += 1;
      map.set(entry.employee_id, c);
    }
    return map;
  }, [availability]);

  function navigateToMonth(m: string) {
    router.push(`/tools/dienstplaner/verfuegbarkeit?month=${m}`);
  }

  function saveSingle(employeeId: number, date: string, status: string) {
    if (!isAdmin) return;
    const fd = new FormData();
    fd.set("employee_id", String(employeeId));
    fd.set("availability_date", date);
    fd.set("status", status);
    setSaveError(null);
    startTransition(async () => {
      try {
        await saveAvailabilityAction(fd);
        flashSuccess(status ? `Status „${status}" gespeichert` : "Status entfernt");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  function applyBulk() {
    if (!isAdmin || !bulkEmployeeId) return;
    if (!bulkFrom || !bulkTo) return;
    if (bulkFrom > bulkTo) return;
    const targets: string[] = [];
    const start = new Date(`${bulkFrom}T00:00:00Z`);
    const end = new Date(`${bulkTo}T00:00:00Z`);
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      targets.push(cursor.toISOString().slice(0, 10));
    }
    setSaveError(null);
    startTransition(async () => {
      try {
        for (const date of targets) {
          const fd = new FormData();
          fd.set("employee_id", String(bulkEmployeeId));
          fd.set("availability_date", date);
          fd.set("status", bulkStatus);
          await saveAvailabilityAction(fd);
        }
        flashSuccess(`${targets.length} Tag${targets.length === 1 ? "" : "e"} gespeichert`);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Bulk-Speichern fehlgeschlagen");
      }
    });
  }

  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
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
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))] w-44 text-center capitalize">
            {monthLabel}
          </h2>
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
          {isAdmin && (
            showClearConfirm ? (
              <div className="ml-2 flex items-center gap-2">
                <span className="text-xs text-red-400">Alle Verfügbarkeiten löschen?</span>
                <button
                  onClick={handleClearMonth}
                  disabled={isClearing}
                  className="px-3 py-1 bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 text-xs rounded-md transition-colors disabled:opacity-50"
                >
                  {isClearing ? "…" : "Ja, löschen"}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1 bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] text-xs rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="ml-2 px-2.5 py-1 text-xs bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded-md transition-colors"
                title="Alle Verfügbarkeits-Einträge dieses Monats löschen (F, U, K, fr, sp, fix)"
              >
                Verfügbarkeiten leeren
              </button>
            )
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {STATUS_OPTIONS.filter((o) => o.value !== "").map((opt) => (
            <span key={opt.value} className="inline-flex items-center gap-1.5">
              <span className={`px-1.5 py-0.5 rounded font-bold ${opt.cls}`}>{opt.label}</span>
              <span className="text-[hsl(var(--muted-foreground))]">{opt.help}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Bulk-Editor */}
      {isAdmin && (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Mitarbeiter
            </label>
            <select
              value={bulkEmployeeId}
              onChange={(e) => setBulkEmployeeId(e.target.value ? Number(e.target.value) : "")}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-3 py-1.5 min-w-[180px]"
              disabled={pending}
            >
              <option value="">— Mitarbeiter wählen —</option>
              {sortedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Von</label>
            <input
              type="date"
              value={bulkFrom}
              onChange={(e) => setBulkFrom(e.target.value)}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-3 py-1.5"
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Bis</label>
            <input
              type="date"
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-3 py-1.5"
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Status</label>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-3 py-1.5"
              disabled={pending}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value ? `${opt.value} – ${opt.help}` : "— leeren —"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={applyBulk}
              disabled={pending || !bulkEmployeeId || !bulkFrom || !bulkTo}
              className="rounded-lg bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] text-xs font-semibold px-4 py-2 disabled:opacity-50"
            >
              {pending ? "Speichere…" : "Auf Zeitraum anwenden"}
            </button>
            {!pending && saveFlash && (
              <span
                role="status"
                className="text-[10px] font-medium text-emerald-500 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10"
              >
                ✓ {saveFlash}
              </span>
            )}
          </div>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.1)] px-4 py-2 text-sm text-[hsl(var(--destructive))] flex items-center justify-between">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="hover:opacity-80">
            ✕
          </button>
        </div>
      )}

      {/* Globale Flash-Meldung – auch sichtbar wenn der Bulk-Editor nicht offen ist (z.B. bei Cell-Edits) */}
      {saveFlash && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-40 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 shadow-lg backdrop-blur"
        >
          ✓ {saveFlash}
        </div>
      )}

      {/* Tabelle */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        <div className="overflow-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: `${260 + days.length * 44}px` }}
          >
            <thead className="bg-[hsl(var(--secondary)/0.5)]">
              <tr>
                <th className="sticky left-0 z-20 bg-[hsl(var(--secondary)/0.95)] backdrop-blur px-3 py-2 text-left text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] min-w-[200px]">
                  Mitarbeiter
                </th>
                {days.map((day) => {
                  const d = new Date(`${day}T00:00:00Z`);
                  const wd = d.getUTCDay();
                  const isToday = day === today;
                  const isWeekend = wd === 0 || wd === 6;
                  return (
                    <th
                      key={day}
                      className={`px-1 py-2 text-center w-[44px] min-w-[44px] ${
                        isToday
                          ? "bg-[hsl(var(--primary)/0.15)]"
                          : isWeekend
                          ? "bg-[hsl(var(--secondary)/0.6)]"
                          : ""
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        {WEEKDAY_SHORT[wd]}
                      </div>
                      <div
                        className={`text-xs font-semibold mt-0.5 ${
                          isToday ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))]"
                        }`}
                      >
                        {d.getUTCDate()}
                      </div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-20 bg-[hsl(var(--secondary)/0.95)] backdrop-blur px-3 py-2 text-right text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] min-w-[140px]">
                  F / U / K
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp, idx) => {
                const c = counts.get(emp.id) ?? { f: 0, u: 0, k: 0, fr: 0, sp: 0, fix: 0 };
                const rowBg = idx % 2 === 0 ? "bg-[hsl(var(--card))]" : "bg-[hsl(var(--secondary)/0.25)]";
                return (
                  <tr key={emp.id} className={`${rowBg} border-t border-[hsl(var(--border))]/60`}>
                    <td
                      className={`sticky left-0 z-10 px-3 py-1.5 ${rowBg} border-r border-[hsl(var(--border))]/40`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ backgroundColor: emp.color }}
                        >
                          {getInitials(emp.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                            {emp.name}
                          </div>
                          {emp.position && (
                            <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
                              {emp.position}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {days.map((day) => {
                      const entry = availMap.get(`${emp.id}-${day}`);
                      const cfg = statusCls(entry?.status ?? "");
                      const d = new Date(`${day}T00:00:00Z`);
                      const wd = d.getUTCDay();
                      const isWeekend = wd === 0 || wd === 6;
                      return (
                        <td
                          key={day}
                          className={`px-0.5 py-0.5 text-center align-middle ${
                            isWeekend ? "bg-[hsl(var(--secondary)/0.3)]" : ""
                          }`}
                        >
                          <select
                            value={(entry?.status ?? "").toUpperCase() === "F" ? "F" : entry?.status ?? ""}
                            onChange={(e) => saveSingle(emp.id, day, e.target.value)}
                            disabled={!isAdmin || pending}
                            className={`w-[40px] text-center font-bold text-[11px] rounded border border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.2)] py-1 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cfg.cls}`}
                            title={cfg.help}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label === "—" ? "" : opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td
                      className={`sticky right-0 z-10 px-3 py-1.5 ${rowBg} border-l border-[hsl(var(--border))]/40 text-right`}
                    >
                      <div className="flex items-center justify-end gap-1.5 text-[10px] tabular-nums">
                        <span
                          title="Frei"
                          className={c.f > 0 ? "text-zinc-300" : "text-[hsl(var(--muted-foreground)/0.5)]"}
                        >
                          {c.f}F
                        </span>
                        <span
                          title="Urlaub"
                          className={c.u > 0 ? "text-purple-400 font-medium" : "text-[hsl(var(--muted-foreground)/0.5)]"}
                        >
                          {c.u}U
                        </span>
                        <span
                          title="Krank"
                          className={c.k > 0 ? "text-amber-400 font-medium" : "text-[hsl(var(--muted-foreground)/0.5)]"}
                        >
                          {c.k}K
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedEmployees.length === 0 && (
                <tr>
                  <td
                    colSpan={days.length + 2}
                    className="px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]"
                  >
                    Keine aktiven Mitarbeiter. Lege zunächst welche im Mitarbeiter-Tab an.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
        Tipp: Über den Bulk-Editor kannst du z.&nbsp;B. einen Urlaub am Stück eintragen. Klick auf eine Zelle
        speichert sofort. „fix"-Zeiten (feste Verfügbarkeit) bitte über die Monatsplan-Ansicht (Rechtsklick auf
        Zelle) eintragen, da dort auch die Start-/Endzeiten gepflegt werden.
      </p>
    </div>
  );
}
