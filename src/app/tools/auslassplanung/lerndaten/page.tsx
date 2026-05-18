import Link from "next/link";
import { ArrowLeft, Brain, Database, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import RoleGate from "@/components/RoleGate";
import { ArchiveClearButton } from "./ArchiveClearButton";

export const metadata = { title: "Lerndaten — Auslassplanung" };
export const dynamic = "force-dynamic";

type CombinedLearningEntry = {
  source: "active" | "archive";
  public_id: string | null;
  show_date: string;
  hall_number: number;
  end_time: string | null;
  room_clear_time: string | null;
  attendees: number;
  cleanup_minutes: number;
  intensity: string;
  movie_title: string | null;
  ai_recommended_staff_count: number | null;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
  was_locked: boolean;
  revisions: Array<{ kind: string; staff_id: number | null; reason: string | null }>;
  early_leaves: Array<{ staff_id: number; reason: string | null }>;
};

type NoFeedbackEntry = {
  id: number;
  show_date: string;
  hall_number: number;
  end_time: string;
  movie_title: string | null;
  plan_status: string;
};

const INTENSITY_LABEL_DE: Record<string, string> = {
  light: "Leicht",
  standard: "Standard",
  intense: "Intensiv",
};

export default async function LerndatenPage() {
  const sb = createAdminClient();

  // 1) Aktive Shows mit Feedback (Page-Limit großzügig setzen — Aggregat-Sicht)
  const { data: activeRows } = await sb
    .from("cinema_cleaning_shows")
    .select(`
      id, public_id, show_date, hall_number, end_time, room_clear_time, attendees, cleanup_minutes,
      intensity, movie_title, plan_status, ai_recommended_staff_count,
      cinema_cleaning_feedback ( actual_staff_count, actual_duration_minutes, rating, notes ),
      cinema_cleaning_plan_revisions ( kind, staff_id, reason ),
      cinema_cleaning_assignments ( staff_id, early_leave, early_leave_reason )
    `)
    .order("show_date", { ascending: false })
    .limit(500);

  // 2) Archiv-Einträge
  const { data: archiveRows } = await sb
    .from("cinema_cleaning_learning_archive")
    .select(
      "show_date, hall_number, end_time, room_clear_time, attendees, cleanup_minutes, intensity, movie_title, ai_recommended_staff_count, actual_staff_count, actual_duration_minutes, rating, feedback_notes, was_locked, revisions, early_leaves, archived_show_public_id",
    )
    .order("show_date", { ascending: false })
    .limit(500);

  // 3) Aktive Shows OHNE Feedback (Blinde Flecken)
  const { data: noFeedbackRows } = await sb
    .from("cinema_cleaning_shows")
    .select(`
      id, show_date, hall_number, end_time, movie_title, plan_status,
      cinema_cleaning_feedback ( id )
    `)
    .order("show_date", { ascending: false })
    .limit(200);

  const combined: CombinedLearningEntry[] = [];
  for (const row of (activeRows ?? []) as any[]) {
    const fb = Array.isArray(row.cinema_cleaning_feedback)
      ? row.cinema_cleaning_feedback[0]
      : row.cinema_cleaning_feedback;
    if (!fb) continue;
    const revisions = Array.isArray(row.cinema_cleaning_plan_revisions)
      ? row.cinema_cleaning_plan_revisions.map((r: any) => ({
          kind: String(r.kind ?? ""),
          staff_id: (r.staff_id as number | null) ?? null,
          reason: (r.reason as string | null) ?? null,
        }))
      : [];
    const earlyLeaves = Array.isArray(row.cinema_cleaning_assignments)
      ? row.cinema_cleaning_assignments
          .filter((a: any) => a.early_leave === true)
          .map((a: any) => ({
            staff_id: a.staff_id as number,
            reason: (a.early_leave_reason as string | null) ?? null,
          }))
      : [];
    combined.push({
      source: "active",
      public_id: row.public_id ?? null,
      show_date: row.show_date,
      hall_number: row.hall_number,
      end_time: row.end_time,
      room_clear_time: row.room_clear_time ?? null,
      attendees: row.attendees,
      cleanup_minutes: row.cleanup_minutes,
      intensity: row.intensity,
      movie_title: row.movie_title,
      ai_recommended_staff_count: row.ai_recommended_staff_count,
      actual_staff_count: fb.actual_staff_count,
      actual_duration_minutes: fb.actual_duration_minutes,
      rating: fb.rating,
      notes: fb.notes,
      was_locked: row.plan_status === "locked" || row.plan_status === "completed",
      revisions,
      early_leaves: earlyLeaves,
    });
  }
  for (const row of (archiveRows ?? []) as any[]) {
    const revisions = Array.isArray(row.revisions)
      ? row.revisions.map((r: any) => ({
          kind: String(r.kind ?? ""),
          staff_id: (r.staff_id as number | null) ?? null,
          reason: (r.reason as string | null) ?? null,
        }))
      : [];
    const earlyLeaves = Array.isArray(row.early_leaves)
      ? row.early_leaves.map((e: any) => ({
          staff_id: Number(e.staff_id) || 0,
          reason: (e.reason as string | null) ?? null,
        }))
      : [];
    combined.push({
      source: "archive",
      public_id: row.archived_show_public_id ?? null,
      show_date: row.show_date,
      hall_number: row.hall_number,
      end_time: row.end_time,
      room_clear_time: row.room_clear_time ?? null,
      attendees: row.attendees,
      cleanup_minutes: row.cleanup_minutes,
      intensity: row.intensity,
      movie_title: row.movie_title,
      ai_recommended_staff_count: row.ai_recommended_staff_count,
      actual_staff_count: row.actual_staff_count,
      actual_duration_minutes: row.actual_duration_minutes,
      rating: row.rating,
      notes: row.feedback_notes,
      was_locked: Boolean(row.was_locked),
      revisions,
      early_leaves: earlyLeaves,
    });
  }
  combined.sort((a, b) => b.show_date.localeCompare(a.show_date));

  const noFeedback: NoFeedbackEntry[] = ((noFeedbackRows ?? []) as any[])
    .filter((r) => {
      const fb = Array.isArray(r.cinema_cleaning_feedback)
        ? r.cinema_cleaning_feedback[0]
        : r.cinema_cleaning_feedback;
      return !fb && (r.plan_status === "open" || r.plan_status === "planned");
    })
    .map((r) => ({
      id: r.id,
      show_date: r.show_date,
      hall_number: r.hall_number,
      end_time: r.end_time,
      movie_title: r.movie_title,
      plan_status: r.plan_status,
    }));

  // Aggregate
  const total = combined.length;
  const activeCount = combined.filter((e) => e.source === "active").length;
  const archivedCount = combined.filter((e) => e.source === "archive").length;
  const byIntensity = groupCount(combined, (e) => e.intensity);
  const byHall = groupCount(combined, (e) => String(e.hall_number));
  const byRating = groupCount(
    combined.filter((e) => e.rating !== null),
    (e) => String(e.rating),
  );

  const intensityDrift = computeDrift(combined, (e) => e.intensity);
  const hallDrift = computeDrift(combined, (e) => String(e.hall_number));

  // Säle mit wenig Datenpunkten
  const hallCounts = new Map<number, number>();
  for (const e of combined) {
    hallCounts.set(e.hall_number, (hallCounts.get(e.hall_number) ?? 0) + 1);
  }
  const thinHalls = Array.from(hallCounts.entries())
    .filter(([, c]) => c < 3)
    .sort((a, b) => a[1] - b[1])
    .map(([hall, count]) => ({ hall, count }));

  // Latest 25 Detail-Einträge — das ist exakt das LEARNING-Array im KI-Prompt
  // (zusätzlich werden Aggregat-Statistiken über die restlichen Einträge gesendet).
  const visibleToAi = combined.slice(0, 25);

  return (
    <RoleGate routeKey="tools/auslassplanung">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 animate-fade-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <div
              className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
              style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
            >
              <Brain size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "hsl(var(--primary))" }}
              >
                KI-Transparenz
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="gradient-text">Lerndaten</span>
            </h1>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Was die KI bei jedem Plan effektiv sieht — kombinierte Daten aus aktiven
              Vorstellungen + Archiv.
            </p>
          </div>
          <Link
            href="/tools/auslassplanung"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
          >
            <ArrowLeft size={14} /> Zurück zur Auslassplanung
          </Link>
        </div>

        {/* Aggregate */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Einträge gesamt" value={total} icon={<Database size={14} />} />
          <StatCard label="Aus aktiven Shows" value={activeCount} />
          <StatCard label="Aus Archiv" value={archivedCount} />
          <StatCard
            label="Ohne Feedback (offen/geplant)"
            value={noFeedback.length}
            tone={noFeedback.length > 0 ? "warn" : "neutral"}
          />
        </section>

        {/* Drift */}
        <section className="feature-card p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "hsl(var(--primary))" }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              KI-Empfehlung vs. Tatsächlich
            </h2>
            <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
              Drift zeigt, ob die KI systematisch zu hoch/niedrig plant
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DriftSection
              title="Pro Intensität"
              rows={intensityDrift.map((d) => ({
                label: INTENSITY_LABEL_DE[d.key] ?? d.key,
                ...d,
              }))}
            />
            <DriftSection
              title="Pro Saal"
              rows={hallDrift.map((d) => ({ label: `Saal ${d.key}`, ...d }))}
            />
          </div>
        </section>

        {/* Verteilungen */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DistributionCard title="Verteilung Intensität" counts={byIntensity} renderLabel={(k) => INTENSITY_LABEL_DE[k] ?? k} />
          <DistributionCard title="Verteilung Säle" counts={byHall} renderLabel={(k) => `Saal ${k}`} />
          <DistributionCard
            title="Rating-Verteilung (1–5)"
            counts={byRating}
            renderLabel={(k) => `${k} ★`}
            emptyHint="Noch keine Ratings"
          />
        </section>

        {/* Blinde Flecken */}
        <section className="feature-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TrendingDown size={14} style={{ color: "hsl(32 95% 55%)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Blinde Flecken
            </h2>
            <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
              Wo der KI noch Lerndaten fehlen
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Vorstellungen ohne Feedback ({noFeedback.length})
              </p>
              {noFeedback.length === 0 ? (
                <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Alle offenen/geplanten Vorstellungen haben Feedback. 👍
                </p>
              ) : (
                <ul className="text-xs flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                  {noFeedback.slice(0, 20).map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>
                        {formatDateShort(s.show_date)} · {s.end_time.slice(0, 5)}
                      </span>
                      <span style={{ color: "hsl(var(--foreground))" }}>
                        Saal {s.hall_number}
                      </span>
                      {s.movie_title && (
                        <span className="italic truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                          „{s.movie_title}"
                        </span>
                      )}
                    </li>
                  ))}
                  {noFeedback.length > 20 && (
                    <li className="text-[10px] italic mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      … und {noFeedback.length - 20} weitere
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Säle mit wenig Daten (&lt; 3 Einträge)
              </p>
              {thinHalls.length === 0 ? (
                <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Alle Säle haben ausreichend Datenpunkte. 👍
                </p>
              ) : (
                <ul className="text-xs flex flex-col gap-1">
                  {thinHalls.map(({ hall, count }) => (
                    <li key={hall} className="flex items-center justify-between gap-3">
                      <span style={{ color: "hsl(var(--foreground))" }}>Saal {hall}</span>
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>
                        {count} {count === 1 ? "Eintrag" : "Einträge"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Tabelle: was die KI effektiv sieht */}
        <section className="feature-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Database size={14} style={{ color: "hsl(var(--primary))" }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Letzte {visibleToAi.length} Detail-Einträge (LEARNING-Array im Prompt) + Aggregat-Statistik
            </h2>
          </div>
          <div className="overflow-auto max-h-[60vh] border border-[hsl(var(--border))] rounded-xl">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[hsl(var(--card))] z-10">
                <tr
                  className="text-left border-b border-[hsl(var(--border))]"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Datum</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Kennung</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Saal</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Film</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Intensität</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Besucher</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Reinigung Soll</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">KI-Empf.</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Tatsächlich</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Dauer-Ist</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">★</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Notiz</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Δ Revisionen</th>
                  <th className="p-2 text-[10px] font-semibold uppercase tracking-[0.15em]">Quelle</th>
                </tr>
              </thead>
              <tbody>
                {visibleToAi.map((e, i) => (
                  <tr
                    key={i}
                    className="border-t border-[hsl(var(--border))]"
                    style={{ background: i % 2 === 1 ? "hsl(var(--secondary) / 0.3)" : "transparent" }}
                  >
                    <td className="p-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {formatDateShort(e.show_date)}
                    </td>
                    <td className="p-2">
                      {e.public_id ? (
                        <code
                          className="text-[10px] font-mono px-1 py-0.5 rounded"
                          style={{
                            background: "hsl(var(--secondary))",
                            color: "hsl(var(--muted-foreground))",
                            border: "1px solid hsl(var(--border))",
                          }}
                        >
                          #{e.public_id}
                        </code>
                      ) : (
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                      )}
                    </td>
                    <td className="p-2 font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {e.hall_number}
                    </td>
                    <td className="p-2 max-w-[220px] truncate" style={{ color: "hsl(var(--foreground))" }}>
                      {e.movie_title ?? <span className="italic" style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                    </td>
                    <td className="p-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {INTENSITY_LABEL_DE[e.intensity] ?? e.intensity}
                    </td>
                    <td className="p-2 tabular-nums">{e.attendees}</td>
                    <td className="p-2 tabular-nums">{e.cleanup_minutes}m</td>
                    <td className="p-2 tabular-nums">
                      {e.ai_recommended_staff_count !== null ? e.ai_recommended_staff_count : "—"}
                    </td>
                    <td className="p-2 tabular-nums font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {e.actual_staff_count}
                    </td>
                    <td className="p-2 tabular-nums">
                      {e.actual_duration_minutes !== null ? `${e.actual_duration_minutes}m` : "—"}
                    </td>
                    <td className="p-2">{e.rating !== null ? `${e.rating}★` : "—"}</td>
                    <td className="p-2 max-w-[180px] truncate italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {e.notes ?? "—"}
                    </td>
                    <td className="p-2 max-w-[200px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {e.revisions.length === 0 && e.early_leaves.length === 0 ? (
                        e.was_locked ? (
                          <span className="text-[10px] italic">final, keine Δ</span>
                        ) : (
                          <span className="text-[10px] italic">—</span>
                        )
                      ) : (
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          {e.revisions.slice(0, 3).map((r, ri) => (
                            <span key={ri} title={r.reason ?? ""}>
                              {r.kind}
                              {r.staff_id ? ` MA#${r.staff_id}` : ""}
                              {r.reason ? ` — ${r.reason.slice(0, 40)}` : ""}
                            </span>
                          ))}
                          {e.early_leaves.slice(0, 2).map((el, ei) => (
                            <span key={`el-${ei}`} title={el.reason ?? ""}>
                              → früher MA#{el.staff_id}
                              {el.reason ? ` — ${el.reason.slice(0, 40)}` : ""}
                            </span>
                          ))}
                          {e.revisions.length + e.early_leaves.length > 5 && (
                            <span className="italic">
                              … +{e.revisions.length + e.early_leaves.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <span
                        className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border"
                        style={
                          e.source === "archive"
                            ? {
                                background: "hsl(var(--secondary))",
                                color: "hsl(var(--muted-foreground))",
                                borderColor: "hsl(var(--border))",
                              }
                            : {
                                background: "hsl(var(--primary) / 0.1)",
                                color: "hsl(var(--primary))",
                                borderColor: "hsl(var(--primary) / 0.3)",
                              }
                        }
                      >
                        {e.source === "archive" ? "Archiv" : "Aktiv"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Archiv verwalten */}
        <section className="feature-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TrendingDown size={14} style={{ color: "hsl(var(--destructive))" }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Archiv verwalten
            </h2>
            <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
              Nur hier können Lerndaten dauerhaft entfernt werden
            </span>
          </div>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Das Archiv enthält aktuell{" "}
            <strong style={{ color: "hsl(var(--foreground))" }}>
              {(archiveRows ?? []).length}{" "}
              {(archiveRows ?? []).length === 1 ? "Eintrag" : "Einträge"}
            </strong>
            . Beim Löschen von Vorstellungen werden Feedback-Daten automatisch hier abgelegt
            — der Bestand wächst also stetig. Wenn du Lerndaten gezielt entfernen willst
            (z. B. veraltete Konstellationen), nutze den Button unten und wähle einen
            Zeitraum oder lösche alle Einträge.
          </p>
          <div>
            <ArchiveClearButton
              archiveDates={(archiveRows ?? []).map((r) => ({ show_date: r.show_date as string }))}
            />
          </div>
        </section>

        {/* Prompt Preview */}
        <section className="feature-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "hsl(var(--primary))" }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Prompt-Preview
            </h2>
            <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
              Roh-JSON, das beim KI-Plan an Gemini geht
            </span>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              LEARNING-Array anzeigen ({visibleToAi.length} Einträge)
            </summary>
            <pre
              className="mt-2 p-3 rounded-lg overflow-auto max-h-96 text-[10px] leading-relaxed border border-[hsl(var(--border))]"
              style={{ background: "hsl(var(--secondary) / 0.5)" }}
            >
              {JSON.stringify(
                visibleToAi.map((e) => ({
                  hall_number: e.hall_number,
                  attendees: e.attendees,
                  cleanup_minutes: e.cleanup_minutes,
                  intensity: e.intensity,
                  movie_title: e.movie_title,
                  actual_staff_count: e.actual_staff_count,
                  actual_duration_minutes: e.actual_duration_minutes,
                  rating: e.rating,
                  notes: e.notes,
                })),
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      </div>
    </RoleGate>
  );
}

// ── Helper-Komponenten ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "neutral" | "warn";
}) {
  const cls =
    tone === "warn"
      ? "feature-card p-4 border-[hsl(32_95%_55%_/_0.35)]"
      : "feature-card p-4";
  return (
    <div className={cls}>
      <div
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: "hsl(var(--foreground))" }}>
        {value}
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  counts,
  renderLabel,
  emptyHint,
}: {
  title: string;
  counts: Map<string, number>;
  renderLabel: (key: string) => string;
  emptyHint?: string;
}) {
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0;
  return (
    <div className="feature-card p-4 flex flex-col gap-2">
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
          {emptyHint ?? "Noch keine Daten"}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 mt-1">
          {entries.map(([key, count]) => {
            const width = max > 0 ? (count / max) * 100 : 0;
            return (
              <li key={key} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate" style={{ color: "hsl(var(--foreground))" }}>
                  {renderLabel(key)}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-[hsl(var(--secondary))]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, background: "hsl(var(--primary))" }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DriftSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; count: number; avgRecommended: number | null; avgActual: number }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
          Noch keine Daten
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const drift =
              r.avgRecommended !== null ? r.avgRecommended - r.avgActual : null;
            const driftClass =
              drift === null
                ? "hsl(var(--muted-foreground))"
                : Math.abs(drift) < 0.5
                ? "hsl(142 70% 45%)"
                : Math.abs(drift) < 1
                ? "hsl(32 95% 55%)"
                : "hsl(var(--destructive))";
            return (
              <li
                key={r.key}
                className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg"
                style={{ background: "hsl(var(--secondary) / 0.5)" }}
              >
                <span className="w-24 font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
                  {r.label}
                </span>
                <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {r.count} Datenpkt.
                </span>
                <span className="ml-auto text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Ø KI {r.avgRecommended?.toFixed(1) ?? "—"}
                </span>
                <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Ø Ist {r.avgActual.toFixed(1)}
                </span>
                {drift !== null && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
                    style={{ color: driftClass }}
                  >
                    {drift > 0 ? (
                      <TrendingUp size={11} />
                    ) : drift < 0 ? (
                      <TrendingDown size={11} />
                    ) : null}
                    {drift > 0 ? "+" : ""}
                    {drift.toFixed(1)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Helper-Funktionen ─────────────────────────────────────────────────

function groupCount<T>(arr: T[], keyFn: (e: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of arr) {
    const k = keyFn(item);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function computeDrift(
  entries: CombinedLearningEntry[],
  keyFn: (e: CombinedLearningEntry) => string,
): Array<{ key: string; count: number; avgRecommended: number | null; avgActual: number }> {
  const groups = new Map<string, CombinedLearningEntry[]>();
  for (const e of entries) {
    const k = keyFn(e);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }
  return Array.from(groups.entries())
    .map(([key, items]) => {
      const withRec = items.filter((i) => i.ai_recommended_staff_count !== null);
      const avgRec =
        withRec.length > 0
          ? withRec.reduce((acc, i) => acc + (i.ai_recommended_staff_count ?? 0), 0) /
            withRec.length
          : null;
      const avgActual =
        items.reduce((acc, i) => acc + i.actual_staff_count, 0) / items.length;
      return { key, count: items.length, avgRecommended: avgRec, avgActual };
    })
    .sort((a, b) => b.count - a.count);
}

function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
  });
}
