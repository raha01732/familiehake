// src/app/tools/dispoplaner/page.tsx
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isPreviewEnvironment } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  addMovieAction,
  addShowAction,
  deleteMovieAction,
  deleteShowAction,
  updateMovieAction,
} from "./actions";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import Link from "next/link";
import { Film, ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";

export const metadata = { title: "Dispoplaner" };

const VERSIONS = ["2D", "3D", "2D Atmos", "3D Atmos", "3D HFR", "3D HFR Atmos"];
const HALLS = Array.from({ length: 8 }, (_, i) => i + 1);

// Distinct palette – works on both light & dark
const MOVIE_PALETTE = [
  "hsl(210 75% 45%)",
  "hsl(165 65% 36%)",
  "hsl(280 60% 46%)",
  "hsl(30 88% 44%)",
  "hsl(0 65% 46%)",
  "hsl(195 70% 36%)",
  "hsl(130 55% 36%)",
  "hsl(305 55% 42%)",
  "hsl(50 80% 40%)",
  "hsl(240 60% 48%)",
];

function movieColor(id: number) {
  return MOVIE_PALETTE[id % MOVIE_PALETTE.length];
}

function getWeekStart(param?: string): Date {
  if (param) {
    const d = new Date(param + "T00:00:00");
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (today.getDay() !== 4) today.setDate(today.getDate() - 1);
  return today;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Formats a Date as "YYYY-MM-DD" using local calendar date, never UTC. */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PageProps = {
  searchParams: Promise<{ week?: string }>;
};

export default async function DispoplanerPage({ searchParams }: PageProps) {
  const [session, toolStatusMap, params] = await Promise.all([
    getSessionInfo(),
    getToolStatusMap(),
    searchParams,
  ]);
  const toolStatus = toolStatusMap["tools/dispoplaner"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  const user = await currentUser();
  if (!user) {
    return (
      <section className="p-6" style={{ color: "hsl(var(--muted-foreground))" }}>
        Bitte melde dich an, um den Dispoplaner zu nutzen.
      </section>
    );
  }

  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isAdmin = role === "admin" || user.id === env().PRIMARY_SUPERADMIN_ID;

  if (isPreviewEnvironment()) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Dispoplaner (Preview)"
          description="In Preview sind Film- und Vorstellungsdaten deaktiviert. Produktionsdaten werden nur in der Live-Umgebung geladen."
          fields={["Filmliste", "Vorstellungen", "Planungsaktionen"]}
        />
      </section>
    );
  }

  const weekParam = typeof params.week === "string" ? params.week : undefined;
  const weekStart = getWeekStart(weekParam);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const sb = createAdminClient();
  const [{ data: movies }, { data: shows }] = await Promise.all([
    sb.from("movies").select("*").order("title"),
    sb
      .from("shows")
      .select("id, hall, start_time, movie_id, version")
      .gte("start_time", weekStart.toISOString())
      .lt("start_time", weekEnd.toISOString())
      .order("start_time"),
  ]);

  const moviesById = new Map((movies ?? []).map((m) => [m.id, m]));

  const weekLabel = `${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} – ${new Date(
    weekEnd.getTime() - 1
  ).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <section className="flex flex-col gap-8 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <Film size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Kino
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Dispoplaner</span>
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Kinovorstellungen planen · Donnerstag bis Mittwoch
            </p>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/tools/dispoplaner?week=${localDateStr(prevWeek)}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))]"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={16} />
          </Link>
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            style={{
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
            }}
          >
            <CalendarDays size={14} style={{ color: "hsl(var(--primary))" }} />
            {weekLabel}
          </div>
          <Link
            href={`/tools/dispoplaner?week=${localDateStr(nextWeek)}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[hsl(var(--secondary))]"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
            aria-label="Nächste Woche"
          >
            <ChevronRight size={16} />
          </Link>
          <Link
            href="/tools/dispoplaner"
            className="rounded-xl px-3 py-2 text-xs font-medium transition-colors hover:bg-[hsl(var(--secondary))]"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
          >
            Heute
          </Link>
        </div>
      </div>

      {/* ── Schedule grid ── */}
      <div className="feature-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-max w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "hsl(var(--secondary))" }}>
                {/* Hall header */}
                <th
                  className="sticky left-0 z-10 py-3 px-4 text-left text-[10px] font-semibold uppercase tracking-[0.15em] w-16"
                  style={{
                    color: "hsl(var(--muted-foreground))",
                    background: "hsl(var(--secondary))",
                    borderRight: "1px solid hsl(var(--border))",
                  }}
                >
                  Saal
                </th>
                {days.map((day) => {
                  const isToday =
                    day.getDate() === today.getDate() &&
                    day.getMonth() === today.getMonth() &&
                    day.getFullYear() === today.getFullYear();
                  return (
                    <th
                      key={day.toDateString()}
                      className="py-3 px-3 text-left text-[11px] min-w-[190px]"
                      style={{
                        borderLeft: "1px solid hsl(var(--border) / 0.5)",
                        color: isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      <div className="font-semibold" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                        {day.toLocaleDateString("de-DE", { weekday: "long" })}
                        {isToday && (
                          <span
                            className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                            style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
                          >
                            Heute
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-normal mt-0.5">
                        {day.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HALLS.map((hallNum) => (
                <tr
                  key={hallNum}
                  className="align-top"
                  style={{ borderTop: "1px solid hsl(var(--border) / 0.5)" }}
                >
                  {/* Hall label */}
                  <td
                    className="sticky left-0 z-10 py-3 px-3"
                    style={{
                      background: "hsl(var(--card))",
                      borderRight: "1px solid hsl(var(--border))",
                    }}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold"
                      style={{
                        background: "hsl(var(--primary) / 0.1)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      {hallNum}
                    </span>
                  </td>

                  {days.map((day) => {
                    const cellShows = (shows ?? []).filter((s) => {
                      const sd = new Date(s.start_time);
                      return (
                        s.hall === hallNum &&
                        sd.getDate() === day.getDate() &&
                        sd.getMonth() === day.getMonth() &&
                        sd.getFullYear() === day.getFullYear()
                      );
                    });

                    return (
                      <td
                        key={`${hallNum}-${day.toDateString()}`}
                        className="py-2 px-2 align-top"
                        style={{ borderLeft: "1px solid hsl(var(--border) / 0.5)" }}
                      >
                        <div className="flex flex-col gap-1.5">
                          {/* Show blocks */}
                          {cellShows.map((show) => {
                            const movie = moviesById.get(show.movie_id);
                            const start = new Date(show.start_time);
                            const end = movie
                              ? new Date(start.getTime() + (movie.runtime + (movie.pre_show ?? 25)) * 60000)
                              : start;
                            const color = movie ? movieColor(movie.id) : "hsl(var(--muted))";

                            return (
                              <div
                                key={show.id}
                                className="relative rounded-lg px-2.5 py-2 text-[11px] group"
                                style={{ background: color, color: "white" }}
                              >
                                <div className="font-bold leading-tight tabular-nums">
                                  {fmtTime(start)} – {fmtTime(end)}
                                </div>
                                <div className="truncate leading-snug mt-0.5 font-medium" title={movie?.title}>
                                  {movie?.title ?? "Unbekannt"}
                                </div>
                                <div className="text-[10px] opacity-70 mt-0.5">{show.version}</div>
                                {isAdmin && (
                                  <form
                                    action={deleteShowAction}
                                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <input type="hidden" name="id" value={show.id} />
                                    <button
                                      type="submit"
                                      title="Vorstellung löschen"
                                      className="flex h-5 w-5 items-center justify-center rounded"
                                      style={{ background: "rgba(0,0,0,0.35)" }}
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </form>
                                )}
                              </div>
                            );
                          })}

                          {/* Add show inline form */}
                          <form action={addShowAction} className="mt-0.5">
                            <input type="hidden" name="hall" value={hallNum} />
                            <input type="hidden" name="date" value={localDateStr(day)} />
                            <div className="flex flex-wrap items-center gap-1">
                              <input
                                type="time"
                                name="time"
                                className="input-field h-6 px-1.5 py-0 text-[11px] w-[72px]"
                                required
                              />
                              <select
                                name="movie_id"
                                className="input-field h-6 px-1.5 py-0 text-[11px] flex-1 min-w-[90px]"
                                required
                              >
                                <option value="">Film…</option>
                                {(movies ?? []).map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.title}
                                  </option>
                                ))}
                              </select>
                              <select
                                name="version"
                                className="input-field h-6 px-1.5 py-0 text-[11px] w-[66px]"
                                required
                              >
                                <option value="">Vers.</option>
                                {VERSIONS.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                title="Vorstellung hinzufügen"
                                className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors"
                                style={{
                                  background: "hsl(var(--primary) / 0.12)",
                                  color: "hsl(var(--primary))",
                                  border: "1px solid hsl(var(--primary) / 0.25)",
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </form>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Movie database ── */}
      <div className="feature-card p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Filmdatenbank
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              {(movies ?? []).length === 0
                ? "Noch keine Filme eingetragen"
                : `${(movies ?? []).length} Film${(movies ?? []).length === 1 ? "" : "e"}`}
            </p>
          </div>
          {/* Color dots legend */}
          {(movies ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-xs justify-end">
              {(movies ?? []).map((m) => (
                <div
                  key={m.id}
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: movieColor(m.id) }}
                  title={m.title}
                />
              ))}
            </div>
          )}
        </div>

        {/* Movie rows */}
        {(movies ?? []).length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid hsl(var(--border))" }}
          >
            <table className="w-full text-sm">
              <thead
                style={{
                  background: "hsl(var(--secondary))",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <tr>
                  <th className="w-5 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
                    Titel
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide w-28">
                    Laufzeit
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide w-28">
                    Vorprogramm
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide w-24">
                    Gesamt
                  </th>
                  <th className="px-3 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {(movies ?? []).map((movie) => (
                  <tr key={movie.id} className="group hover:bg-[hsl(var(--secondary)/0.4)] transition-colors">
                    <td className="px-3 py-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ background: movieColor(movie.id) }}
                      />
                    </td>
                    <td className="px-2 py-1.5" colSpan={4}>
                      <form action={updateMovieAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={movie.id} />
                        <input
                          name="title"
                          defaultValue={movie.title}
                          className="input-field flex-1 min-w-[140px] text-sm"
                          required
                        />
                        <div className="flex items-center gap-1">
                          <input
                            name="runtime"
                            type="number"
                            defaultValue={movie.runtime}
                            className="input-field w-20 text-right text-sm"
                            required
                            min="1"
                            aria-label="Laufzeit in Minuten"
                          />
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>min</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            name="pre_show"
                            type="number"
                            defaultValue={movie.pre_show ?? 25}
                            className="input-field w-20 text-right text-sm"
                            min="0"
                            aria-label="Vorprogramm in Minuten"
                          />
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>VP</span>
                        </div>
                        <span
                          className="text-xs tabular-nums"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          = {movie.runtime + (movie.pre_show ?? 25)} min
                        </span>
                        <button
                          type="submit"
                          className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                          style={{
                            background: "hsl(var(--primary) / 0.1)",
                            color: "hsl(var(--primary))",
                            border: "1px solid hsl(var(--primary) / 0.2)",
                          }}
                        >
                          Speichern
                        </button>
                      </form>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-1.5">
                        <form action={deleteMovieAction}>
                          <input type="hidden" name="id" value={movie.id} />
                          <button
                            type="submit"
                            title="Film löschen"
                            className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            style={{
                              color: "hsl(var(--destructive))",
                              background: "hsl(var(--destructive) / 0.08)",
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add movie form */}
        <form
          action={addMovieAction}
          className="flex flex-wrap items-end gap-3 pt-4"
          style={{ borderTop: "1px solid hsl(var(--border) / 0.5)" }}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Titel
            </label>
            <input name="title" placeholder="Filmtitel" className="input-field" required />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Laufzeit (min)
            </label>
            <input
              name="runtime"
              type="number"
              placeholder="120"
              className="input-field w-28"
              required
              min="1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Vorprg. (min)
            </label>
            <input
              name="pre_show"
              type="number"
              defaultValue={25}
              className="input-field w-28"
              min="0"
            />
          </div>
          <button
            type="submit"
            className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <Plus size={14} />
            Film hinzufügen
          </button>
        </form>
      </div>
    </section>
  );
}
