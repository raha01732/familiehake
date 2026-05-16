"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Clock, Coffee, MessageCircle } from "lucide-react";

type MyShiftEntry = {
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  comment: string | null;
};

type MyShiftsResponse = {
  ok: boolean;
  linked: boolean;
  employee: { id: number; name: string; color: string } | null;
  today: string;
  shifts: MyShiftEntry[];
};

const POLL_INTERVAL_MS = 30_000;

function formatDateLabel(iso: string, today: string): string {
  if (iso === today) return "Heute";
  const d = new Date(`${iso}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - todayDate.getTime()) / 86_400_000);
  if (diff === 1) return "Morgen";

  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(value: string | null): string {
  if (!value) return "–";
  return value.slice(0, 5);
}

function calcDurationMinutes(start: string | null, end: string | null, pause: number | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, mins - (pause ?? 0));
}

function formatDuration(mins: number | null): string | null {
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function NextShiftsTile() {
  const [state, setState] = useState<MyShiftsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchShifts = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/dienstplaner/my-shifts", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as MyShiftsResponse;
      setState(data);
      setError(false);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchShifts();
    const interval = setInterval(fetchShifts, POLL_INTERVAL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void fetchShifts();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fetchShifts);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", fetchShifts);
      abortRef.current?.abort();
    };
  }, [fetchShifts]);

  if (loading && !state) {
    return (
      <div
        className="feature-card relative flex flex-col gap-3 overflow-hidden p-5"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
          >
            <CalendarClock size={18} strokeWidth={2} aria-hidden />
          </span>
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Dienstplan
            </p>
            <h3 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Lade deine nächsten Schichten …
            </h3>
          </div>
        </div>
      </div>
    );
  }

  if (!state?.linked) return null;

  const shifts = state.shifts ?? [];
  const hasShifts = shifts.length > 0;
  const employee = state.employee;
  const accent = employee?.color ?? "hsl(var(--primary))";

  return (
    <Link
      href="/tools/dienstplaner"
      aria-label="Zum Dienstplaner"
      className="feature-card group relative flex flex-col gap-4 overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
      style={{ border: "1px solid hsl(var(--border))" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{ background: `${accent}33` }}
      />

      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}22`, color: accent }}
        >
          <CalendarClock size={18} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Deine nächsten Schichten
          </p>
          <h3
            className="text-base font-semibold"
            style={{ color: "hsl(var(--foreground))" }}
          >
            {employee?.name ?? "Dienstplan"}
          </h3>
        </div>
        <span
          className="hidden h-2 w-2 rounded-full sm:inline-block"
          style={{
            background: error ? "hsl(0 72% 55%)" : "hsl(142 71% 45%)",
            boxShadow: error ? "none" : "0 0 0 4px hsl(142 71% 45% / 0.18)",
          }}
          title={error ? "Live-Update unterbrochen" : "Live"}
          aria-hidden
        />
      </div>

      {hasShifts ? (
        <ul className="flex flex-col gap-2">
          {shifts.slice(0, 5).map((s, idx) => {
            const dur = calcDurationMinutes(s.start_time, s.end_time, s.break_minutes);
            const durLabel = formatDuration(dur);
            const isFirst = idx === 0;
            return (
              <li
                key={`${s.shift_date}-${s.start_time ?? ""}-${idx}`}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{
                  background: isFirst ? `${accent}10` : "hsl(var(--card) / 0.6)",
                  border: `1px solid ${isFirst ? accent + "55" : "hsl(var(--border) / 0.7)"}`,
                }}
              >
                <div className="flex w-16 flex-shrink-0 flex-col leading-tight">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {formatDateLabel(s.shift_date, state.today)}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "hsl(var(--foreground))" }}>
                    {formatTime(s.start_time)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="flex items-center gap-1.5 text-sm font-medium"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    <Clock size={13} aria-hidden style={{ color: "hsl(var(--muted-foreground))" }} />
                    <span>
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    </span>
                    {durLabel && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${accent}22`,
                          color: accent,
                        }}
                      >
                        {durLabel}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {s.break_minutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Coffee size={11} aria-hidden />
                        {s.break_minutes} min Pause
                      </span>
                    ) : null}
                    {s.comment ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MessageCircle size={11} aria-hidden />
                        <span className="truncate">{s.comment}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Aktuell sind keine kommenden Schichten für dich eingeplant.
        </p>
      )}

      <div
        className="flex items-center justify-between text-xs"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        <span>
          {hasShifts
            ? shifts.length > 5
              ? `${shifts.length} kommende Schichten – Top 5 angezeigt`
              : `${shifts.length} kommende Schicht${shifts.length === 1 ? "" : "en"}`
            : "Wird live aktualisiert"}
        </span>
        <span
          className="font-semibold transition-opacity group-hover:opacity-70"
          style={{ color: "hsl(var(--primary))" }}
        >
          Zum Dienstplaner →
        </span>
      </div>
    </Link>
  );
}
