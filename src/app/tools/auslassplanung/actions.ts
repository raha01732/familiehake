// /workspace/familiehake/src/app/tools/auslassplanung/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import {
  type CleaningShow,
  type CleaningStaff,
  recommendStaffCount,
  isCleanupWithinShift,
} from "./utils";
import {
  generateCleaningPlanWithAi,
  auslassplanungAiEnabled,
} from "@/lib/auslassplanung/ai";
import {
  analyzeFupImage,
  fupImportEnabled,
  type FupParseResult,
} from "@/lib/auslassplanung/fup";
import {
  estimateAttendeesWithAi,
  attendeesAiEnabled,
} from "@/lib/auslassplanung/attendees-ai";
import { generateShowCode } from "@/lib/auslassplanung/show-code";

const PLAN_PATH = "/tools/auslassplanung";

async function assertCallerHasCinemaAccess() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const role = getRoleFromPublicMetadata(user.publicMetadata);
  const isPriv =
    role === "admin" ||
    role === "cinema" ||
    user.id === env().PRIMARY_SUPERADMIN_ID;
  if (!isPriv) throw new Error("FORBIDDEN_CINEMA_ACCESS");
  return user;
}

function normalizeTimeInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h < 0 || h > 23 || mins < 0 || mins > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Erzeugt einen eindeutigen public_id-Code für cinema_cleaning_shows.
// 32^7 Kollisionen sind extrem unwahrscheinlich; nach max. 5 Versuchen wird
// ein Fehler geworfen.
async function generateUniquePublicId(sb: SupabaseAdmin): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShowCode();
    const { count } = await sb
      .from("cinema_cleaning_shows")
      .select("*", { count: "exact", head: true })
      .eq("public_id", code);
    if ((count ?? 0) === 0) return code;
  }
  throw new Error("Konnte keinen eindeutigen Show-Code generieren.");
}

// ── Staff CRUD ────────────────────────────────────────────────────────

export async function createStaffAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const preference = String(formData.get("preference") || "preferred") === "backup" ? "backup" : "preferred";
  const color = String(formData.get("color") || "#06b6d4").trim();
  const userId = String(formData.get("user_id") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const workStart = normalizeTimeInput(String(formData.get("work_start") || ""));
  const workEnd = normalizeTimeInput(String(formData.get("work_end") || ""));

  const sb = createAdminClient();
  const { data: last } = await sb
    .from("cinema_cleaning_staff")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (last?.sort_order ?? -1) + 1;

  await sb.from("cinema_cleaning_staff").insert({
    name,
    preference,
    color,
    is_active: true,
    user_id: userId,
    notes,
    sort_order: nextSortOrder,
    work_start: workStart,
    work_end: workEnd,
  });
  revalidatePath(PLAN_PATH);
}

export async function updateStaffAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const id = Number(formData.get("id"));
  if (!id) return;
  const updates: Record<string, unknown> = {};
  const name = formData.get("name");
  if (typeof name === "string") {
    const v = name.trim();
    if (!v) return;
    updates.name = v;
  }
  const preference = formData.get("preference");
  if (typeof preference === "string") {
    updates.preference = preference === "backup" ? "backup" : "preferred";
  }
  const color = formData.get("color");
  if (typeof color === "string" && color.trim()) updates.color = color.trim();
  const userId = formData.get("user_id");
  if (typeof userId === "string") updates.user_id = userId.trim() || null;
  const notes = formData.get("notes");
  if (typeof notes === "string") updates.notes = notes.trim() || null;
  const isActive = formData.get("is_active");
  if (isActive !== null) updates.is_active = isActive === "true";
  const workStart = formData.get("work_start");
  if (typeof workStart === "string") {
    updates.work_start = workStart.trim() === "" ? null : normalizeTimeInput(workStart);
  }
  const workEnd = formData.get("work_end");
  if (typeof workEnd === "string") {
    updates.work_end = workEnd.trim() === "" ? null : normalizeTimeInput(workEnd);
  }

  if (Object.keys(updates).length === 0) return;
  const sb = createAdminClient();
  await sb.from("cinema_cleaning_staff").update(updates).eq("id", id);
  revalidatePath(PLAN_PATH);
}

export async function deleteStaffAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const id = Number(formData.get("id"));
  if (!id) return;
  const sb = createAdminClient();
  await sb.from("cinema_cleaning_staff").delete().eq("id", id);
  revalidatePath(PLAN_PATH);
}

// Tauscht sort_order mit dem direkten Nachbarn innerhalb derselben
// Präferenz-Gruppe (preferred / backup). direction = "up" | "down".
// Niedrigere sort_order = höhere Priorität in der Allokation.
export async function moveStaffAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const id = Number(formData.get("id"));
  const direction = String(formData.get("direction") || "");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const sb = createAdminClient();
  const { data: rows } = await sb
    .from("cinema_cleaning_staff")
    .select("id, preference, sort_order")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (!rows) return;

  const current = rows.find((r) => (r as { id: number }).id === id) as
    | { id: number; preference: string; sort_order: number }
    | undefined;
  if (!current) return;

  const sameGroup = (rows as Array<{ id: number; preference: string; sort_order: number }>).filter(
    (r) => r.preference === current.preference,
  );
  const idx = sameGroup.findIndex((r) => r.id === id);
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= sameGroup.length) return;

  const target = sameGroup[targetIdx];
  // sort_order tauschen — wenn beide gleich sind (alte DB), explizit neue Werte vergeben
  if (current.sort_order === target.sort_order) {
    const lower = direction === "up" ? current.sort_order : current.sort_order + 1;
    const higher = direction === "up" ? current.sort_order + 1 : current.sort_order;
    await sb.from("cinema_cleaning_staff").update({ sort_order: lower }).eq("id", current.id);
    await sb.from("cinema_cleaning_staff").update({ sort_order: higher }).eq("id", target.id);
  } else {
    await sb.from("cinema_cleaning_staff").update({ sort_order: target.sort_order }).eq("id", current.id);
    await sb.from("cinema_cleaning_staff").update({ sort_order: current.sort_order }).eq("id", target.id);
  }
  revalidatePath(PLAN_PATH);
}

// ── Show CRUD ─────────────────────────────────────────────────────────

export async function createShowAction(formData: FormData) {
  const user = await assertCallerHasCinemaAccess();
  const showDate = String(formData.get("show_date") || "").trim();
  const hallNumber = Number(formData.get("hall_number") || 0);
  const hallLabel = String(formData.get("hall_label") || "").trim() || null;
  const endTime = normalizeTimeInput(String(formData.get("end_time") || ""));
  const attendees = Math.max(0, Number(formData.get("attendees") || 0));
  const cleanupMinutes = Math.max(1, Number(formData.get("cleanup_minutes") || 15));
  const rawIntensity = String(formData.get("intensity") || "standard");
  const intensity =
    rawIntensity === "light" || rawIntensity === "intense" ? rawIntensity : "standard";
  const movieTitle = String(formData.get("movie_title") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!showDate || !hallNumber || !endTime) return;

  const sb = createAdminClient();
  const publicId = await generateUniquePublicId(sb);
  await sb.from("cinema_cleaning_shows").insert({
    public_id: publicId,
    show_date: showDate,
    hall_number: hallNumber,
    hall_label: hallLabel,
    end_time: endTime,
    attendees,
    cleanup_minutes: cleanupMinutes,
    intensity,
    movie_title: movieTitle,
    notes,
    plan_status: "open",
    created_by: user.id,
  });
  revalidatePath(PLAN_PATH);
}

export async function updateShowAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const id = Number(formData.get("id"));
  if (!id) return;
  const updates: Record<string, unknown> = {};

  const showDate = formData.get("show_date");
  if (typeof showDate === "string" && showDate.trim()) updates.show_date = showDate.trim();

  const hallNumber = formData.get("hall_number");
  if (hallNumber !== null) {
    const v = Number(hallNumber);
    if (v > 0) updates.hall_number = v;
  }
  const hallLabel = formData.get("hall_label");
  if (typeof hallLabel === "string") updates.hall_label = hallLabel.trim() || null;

  const endTime = formData.get("end_time");
  if (typeof endTime === "string") {
    const normalized = normalizeTimeInput(endTime);
    if (normalized) updates.end_time = normalized;
  }
  const attendees = formData.get("attendees");
  if (attendees !== null) updates.attendees = Math.max(0, Number(attendees) || 0);

  const cleanupMinutes = formData.get("cleanup_minutes");
  if (cleanupMinutes !== null) updates.cleanup_minutes = Math.max(1, Number(cleanupMinutes) || 15);

  const intensity = formData.get("intensity");
  if (typeof intensity === "string") {
    updates.intensity =
      intensity === "light" || intensity === "intense" ? intensity : "standard";
  }
  const movieTitle = formData.get("movie_title");
  if (typeof movieTitle === "string") updates.movie_title = movieTitle.trim() || null;

  const notes = formData.get("notes");
  if (typeof notes === "string") updates.notes = notes.trim() || null;

  const planStatus = formData.get("plan_status");
  if (typeof planStatus === "string") {
    const allowed = ["open", "planned", "completed", "cancelled"];
    if (allowed.includes(planStatus)) updates.plan_status = planStatus;
  }

  if (Object.keys(updates).length === 0) return;
  updates.updated_at = new Date().toISOString();
  const sb = createAdminClient();
  await sb.from("cinema_cleaning_shows").update(updates).eq("id", id);
  revalidatePath(PLAN_PATH);
}

export async function deleteShowAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const id = Number(formData.get("id"));
  if (!id) return;
  const sb = createAdminClient();
  // Feedback (falls vorhanden) ins Archiv kopieren, damit die KI dieses
  // Lernen behält.
  await archiveShowsByIds(sb, [id]);
  await sb.from("cinema_cleaning_shows").delete().eq("id", id);
  revalidatePath(PLAN_PATH);
}

// Löscht ALLE Vorstellungen — Feedback-Einträge werden vorher ins Lern-Archiv
// kopiert, damit die KI das Wissen nicht verliert.
export async function deleteAllShowsAction(formData: FormData): Promise<{
  deleted: number;
  archived: number;
}> {
  await assertCallerHasCinemaAccess();
  if (String(formData.get("confirm") || "") !== "yes") return { deleted: 0, archived: 0 };
  const sb = createAdminClient();
  const { count: before } = await sb
    .from("cinema_cleaning_shows")
    .select("*", { count: "exact", head: true });

  // Alle Show-IDs holen, deren Feedback wir bewahren wollen
  const { data: feedbackRows } = await sb
    .from("cinema_cleaning_feedback")
    .select("show_id");
  const idsToArchive = (feedbackRows ?? [])
    .map((r) => (r as { show_id: number }).show_id)
    .filter((n) => Number.isFinite(n));
  const archived = await archiveShowsByIds(sb, idsToArchive);

  // Postgrest verlangt eine WHERE-Klausel — id > 0 trifft alle echten Rows.
  await sb.from("cinema_cleaning_shows").delete().gt("id", 0);
  revalidatePath(PLAN_PATH);
  return { deleted: before ?? 0, archived };
}

// Überträgt alle Feedback-Einträge ins Lern-Archiv, ohne die Vorstellungen
// zu löschen. Idempotent — wiederholtes Aufrufen erzeugt keine Duplikate
// (archiveShowsByIds entfernt vorher bestehende Archiv-Einträge für die
// gleichen Show-IDs). Optional kann show_id[] mitgegeben werden, um nur
// bestimmte Vorstellungen zu archivieren.
export async function archiveFeedbackAction(
  formData: FormData,
): Promise<{ archived: number; eligible: number }> {
  await assertCallerHasCinemaAccess();
  const sb = createAdminClient();

  const explicitIds = formData
    .getAll("show_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  let candidateIds: number[];
  if (explicitIds.length > 0) {
    // Nur Shows mit Feedback aus der Auswahl
    const { data } = await sb
      .from("cinema_cleaning_feedback")
      .select("show_id")
      .in("show_id", explicitIds);
    candidateIds = (data ?? [])
      .map((r) => (r as { show_id: number }).show_id)
      .filter((n) => Number.isFinite(n));
  } else {
    const { data } = await sb.from("cinema_cleaning_feedback").select("show_id");
    candidateIds = (data ?? [])
      .map((r) => (r as { show_id: number }).show_id)
      .filter((n) => Number.isFinite(n));
  }

  const archived = await archiveShowsByIds(sb, candidateIds);
  revalidatePath(PLAN_PATH);
  revalidatePath("/tools/auslassplanung/lerndaten");
  return { archived, eligible: candidateIds.length };
}

// ── Planung ───────────────────────────────────────────────────────────

type PlanResult = {
  showId: number;
  recommendedCount: number;
  assignments: { staff_id: number; reason: string | null }[];
  source: "ai" | "heuristic";
  aiNote: string | null;
  unmet?: string;
};

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type ShowWindowInput = {
  show_date: string;
  end_time: string;
  cleanup_minutes: number;
};

function showWindowMs(s: ShowWindowInput): { startMs: number; endMs: number } {
  const time = s.end_time.length >= 5 ? s.end_time.slice(0, 5) : s.end_time;
  const startMs = Date.parse(`${s.show_date}T${time}:00Z`);
  const endMs = startMs + Math.max(0, s.cleanup_minutes) * 60_000;
  return { startMs, endMs };
}

function shiftDate(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function windowsOverlap(a: ShowWindowInput, b: ShowWindowInput): boolean {
  const wa = showWindowMs(a);
  const wb = showWindowMs(b);
  return wa.startMs < wb.endMs && wb.startMs < wa.endMs;
}

// Welche MA sind in zur Vorstellung überlappenden Reinigungsfenstern
// (anderer Saal, gleiche Zeit) bereits eingeteilt? Wird als WEICHE Präferenz
// behandelt: erst MA ohne Überschneidung wählen, sonst trotzdem zuteilen —
// MA dürfen vorzeitig aus einem Auslass raus.
async function getExternalBusy(
  sb: SupabaseAdmin,
  show: { id: number } & ShowWindowInput,
  excludeShowIds: ReadonlySet<number>
): Promise<{ busy: Set<number>; conflictHallNumbers: Set<number> }> {
  const { startMs, endMs } = showWindowMs(show);
  const dateMin = shiftDate(show.show_date, -1);
  const dateMax = shiftDate(show.show_date, 1);

  const { data: nearby } = await sb
    .from("cinema_cleaning_shows")
    .select("id, hall_number, show_date, end_time, cleanup_minutes")
    .gte("show_date", dateMin)
    .lte("show_date", dateMax);

  const overlappingShows = (nearby ?? []).filter((row) => {
    if (excludeShowIds.has(row.id as number)) return false;
    if ((row.id as number) === show.id) return false;
    const w = showWindowMs(row as ShowWindowInput);
    return w.startMs < endMs && startMs < w.endMs;
  });
  if (overlappingShows.length === 0) {
    return { busy: new Set(), conflictHallNumbers: new Set() };
  }
  const overlappingIds = overlappingShows.map((r) => r.id as number);

  const { data: assignments } = await sb
    .from("cinema_cleaning_assignments")
    .select("staff_id, show_id")
    .in("show_id", overlappingIds);

  const busy = new Set<number>();
  const showsWithAssignments = new Set<number>();
  for (const a of assignments ?? []) {
    const sid = (a as { staff_id: number }).staff_id;
    const showRef = (a as { show_id: number }).show_id;
    if (typeof sid === "number") busy.add(sid);
    if (typeof showRef === "number") showsWithAssignments.add(showRef);
  }
  const conflictHallNumbers = new Set<number>();
  for (const r of overlappingShows) {
    if (showsWithAssignments.has(r.id as number)) {
      conflictHallNumbers.add((r as { hall_number: number }).hall_number);
    }
  }
  return { busy, conflictHallNumbers };
}

// STRIKT: gibt nur einen Kandidaten zurück, der NICHT in einem überlappenden
// Auslass eingeteilt ist. Bei Konflikten => null. Der Aufrufer probiert dann
// einen anderen Pool (z.B. Backup), bevor er auf die Overlap-Variante zurückfällt.
//   - excludeIds: schon in dieser Vorstellung eingeteilt
//   - softBusy: in einer parallelen Vorstellung im Batch zugewiesen
//   - usageCount / sort_order: Tiebreaker für gleichberechtigte Kandidaten
//   - availabilityFilter: harter Arbeitszeit-Filter
function pickFromPool(
  pool: CleaningStaff[],
  excludeIds: ReadonlySet<number>,
  softBusy: ReadonlySet<number>,
  usageCount: ReadonlyMap<number, number>,
  availabilityFilter?: (s: CleaningStaff) => boolean,
): { staff: CleaningStaff; overlap: boolean } | null {
  let candidates = pool.filter((s) => !excludeIds.has(s.id));
  if (availabilityFilter) candidates = candidates.filter(availabilityFilter);
  if (candidates.length === 0) return null;
  const nonOverlapping = candidates.filter((s) => !softBusy.has(s.id));
  if (nonOverlapping.length === 0) return null;
  const best = nonOverlapping.reduce((acc, c) => {
    const cUse = usageCount.get(c.id) ?? 0;
    const aUse = usageCount.get(acc.id) ?? 0;
    if (cUse !== aUse) return cUse < aUse ? c : acc;
    return c.sort_order < acc.sort_order ? c : acc;
  });
  return { staff: best, overlap: false };
}

// Helper: probiert die strikten Pools erst durch — NIEMALS Soft-Overlap.
// Reihenfolge: preferred-strict → backup-strict → null.
// Wenn nichts passt bleibt der Slot leer; der Aufrufer hängt einen
// "unmet"-Hinweis an, statt jemanden in zwei parallele Auslässe zu stapeln.
function pickByPriority(
  preferredPool: CleaningStaff[],
  backupPool: CleaningStaff[],
  excludeIds: ReadonlySet<number>,
  softBusy: ReadonlySet<number>,
  usageCount: ReadonlyMap<number, number>,
  availabilityFilter?: (s: CleaningStaff) => boolean,
): { staff: CleaningStaff; overlap: boolean; isPreferred: boolean } | null {
  const p1 = pickFromPool(preferredPool, excludeIds, softBusy, usageCount, availabilityFilter);
  if (p1) return { ...p1, isPreferred: true };
  const p2 = pickFromPool(backupPool, excludeIds, softBusy, usageCount, availabilityFilter);
  if (p2) return { ...p2, isPreferred: false };
  return null;
}

// Liefert eine Verfügbarkeits-Funktion für eine bestimmte Vorstellung.
// Berücksichtigt die Arbeitszeit-Fenster pro MA.
function makeAvailabilityFilter(
  show: { end_time: string; cleanup_minutes: number },
): (s: CleaningStaff) => boolean {
  return (s) =>
    isCleanupWithinShift(show.end_time, show.cleanup_minutes, s.work_start, s.work_end);
}

type ExistingAssignment = {
  staff_id: number;
  assigned_by: string;
  reason: string | null;
};

function isManualAssignment(a: { assigned_by: string }): boolean {
  return a.assigned_by === "manual" || a.assigned_by === "override";
}

type LearningEntry = {
  hall_number: number;
  attendees: number;
  cleanup_minutes: number;
  intensity: string;
  movie_title: string | null;
  actual_staff_count: number;
  actual_duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
};
type LearningEntryWithDate = LearningEntry & { _sortKey: string };

/** Archiviert die Feedback-Daten der angegebenen Vorstellungen ins Lern-Archiv.
 *  Idempotent: bestehende Archiv-Einträge für dieselbe Show-ID werden vorher
 *  entfernt, damit derselbe Datensatz nicht doppelt der KI vorgesetzt wird.
 *  Rückgabe: Anzahl der neu eingefügten Einträge.
 */
async function archiveShowsByIds(sb: SupabaseAdmin, showIds: number[]): Promise<number> {
  if (showIds.length === 0) return 0;
  const { data: rows } = await sb
    .from("cinema_cleaning_shows")
    .select(`
      id, public_id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes,
      intensity, movie_title, notes, ai_recommended_staff_count,
      cinema_cleaning_feedback ( actual_staff_count, actual_duration_minutes, rating, notes )
    `)
    .in("id", showIds);
  const toArchive: Record<string, unknown>[] = [];
  for (const r of (rows ?? []) as any[]) {
    const fb = Array.isArray(r.cinema_cleaning_feedback)
      ? r.cinema_cleaning_feedback[0]
      : r.cinema_cleaning_feedback;
    if (!fb) continue;
    toArchive.push({
      show_date: r.show_date,
      hall_number: r.hall_number,
      hall_label: r.hall_label,
      end_time: r.end_time,
      attendees: r.attendees,
      cleanup_minutes: r.cleanup_minutes,
      intensity: r.intensity,
      movie_title: r.movie_title,
      show_notes: r.notes,
      ai_recommended_staff_count: r.ai_recommended_staff_count,
      actual_staff_count: fb.actual_staff_count,
      actual_duration_minutes: fb.actual_duration_minutes,
      rating: fb.rating,
      feedback_notes: fb.notes,
      archived_from_show_id: r.id,
      archived_show_public_id: r.public_id ?? null,
    });
  }
  if (toArchive.length === 0) return 0;
  // Idempotent: bestehende Einträge zu denselben Show-IDs vorher entfernen
  await sb
    .from("cinema_cleaning_learning_archive")
    .delete()
    .in("archived_from_show_id", showIds);
  await sb.from("cinema_cleaning_learning_archive").insert(toArchive);
  return toArchive.length;
}

const LEARNING_LIMIT = 100;

async function loadLearningData(
  sb: SupabaseAdmin,
  excludeShowIds: ReadonlySet<number>,
): Promise<LearningEntry[]> {
  // 1) Archiv parallel zu aktiven Shows laden
  const [pastRowsResult, archiveRowsResult] = await Promise.all([
    sb
      .from("cinema_cleaning_shows")
      .select(`
        id, show_date, hall_number, attendees, cleanup_minutes, intensity, movie_title,
        cinema_cleaning_feedback ( actual_staff_count, actual_duration_minutes, rating, notes )
      `)
      .order("show_date", { ascending: false })
      .limit(LEARNING_LIMIT * 4),
    sb
      .from("cinema_cleaning_learning_archive")
      .select(
        "show_date, hall_number, attendees, cleanup_minutes, intensity, movie_title, actual_staff_count, actual_duration_minutes, rating, feedback_notes, archived_from_show_id",
      )
      .order("show_date", { ascending: false })
      .limit(LEARNING_LIMIT),
  ]);
  const pastRows = pastRowsResult.data;
  const archiveRows = archiveRowsResult.data;

  // Show-IDs, die bereits im Archiv stehen — diese Shows aus dem aktiven Pool
  // ausschließen, sonst sähe die KI denselben Datensatz doppelt.
  const archivedShowIds = new Set<number>();
  for (const row of (archiveRows ?? []) as any[]) {
    const id = row.archived_from_show_id;
    if (typeof id === "number") archivedShowIds.add(id);
  }

  const activeOut: LearningEntryWithDate[] = [];
  for (const row of (pastRows ?? []) as any[]) {
    if (excludeShowIds.has(row.id as number)) continue;
    if (archivedShowIds.has(row.id as number)) continue;
    const fb = Array.isArray(row.cinema_cleaning_feedback)
      ? row.cinema_cleaning_feedback[0]
      : row.cinema_cleaning_feedback;
    if (!fb) continue;
    activeOut.push({
      hall_number: row.hall_number as number,
      attendees: row.attendees as number,
      cleanup_minutes: row.cleanup_minutes as number,
      intensity: row.intensity as string,
      movie_title: (row.movie_title as string | null) ?? null,
      actual_staff_count: fb.actual_staff_count as number,
      actual_duration_minutes: (fb.actual_duration_minutes as number | null) ?? null,
      rating: (fb.rating as number | null) ?? null,
      notes: (fb.notes as string | null) ?? null,
      _sortKey: row.show_date as string,
    });
  }

  const archiveOut: LearningEntryWithDate[] = (archiveRows ?? []).map((row: any) => ({
    hall_number: row.hall_number as number,
    attendees: row.attendees as number,
    cleanup_minutes: row.cleanup_minutes as number,
    intensity: row.intensity as string,
    movie_title: (row.movie_title as string | null) ?? null,
    actual_staff_count: row.actual_staff_count as number,
    actual_duration_minutes: (row.actual_duration_minutes as number | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    notes: (row.feedback_notes as string | null) ?? null,
    _sortKey: row.show_date as string,
  }));

  // 2) Mergen, nach show_date desc sortieren, auf LIMIT slicen, Sort-Key strippen
  return [...activeOut, ...archiveOut]
    .sort((a, b) => b._sortKey.localeCompare(a._sortKey))
    .slice(0, LEARNING_LIMIT)
    .map(({ _sortKey, ...rest }) => {
      void _sortKey;
      return rest;
    });
}

async function computeRecommendedCount(
  show: CleaningShow,
  poolForAi: CleaningStaff[],
  learning: Awaited<ReturnType<typeof loadLearningData>>
): Promise<{ count: number; aiNote: string | null; source: "ai" | "heuristic" }> {
  let count = recommendStaffCount(show.attendees, show.intensity);
  let aiNote: string | null = null;
  let source: "ai" | "heuristic" = "heuristic";
  if (!auslassplanungAiEnabled()) {
    return { count, aiNote, source };
  }
  try {
    const aiResult = await generateCleaningPlanWithAi({
      show: {
        id: show.id,
        show_date: show.show_date,
        hall_number: show.hall_number,
        hall_label: show.hall_label,
        end_time: show.end_time,
        attendees: show.attendees,
        cleanup_minutes: show.cleanup_minutes,
        intensity: show.intensity,
        movie_title: show.movie_title,
        notes: show.notes,
      },
      staff: poolForAi.map((s) => ({
        id: s.id,
        name: s.name,
        preference: s.preference,
        notes: s.notes,
      })),
      learning,
    });
    if (aiResult) {
      count = aiResult.recommended_staff_count;
      aiNote = aiResult.notes ?? null;
      source = "ai";
    }
  } catch (e) {
    console.error("[auslassplanung] ai count failed", e);
  }
  return { count, aiNote, source };
}

function reasonForPickedSlot(
  isPreferred: boolean,
  isFirstSlot: boolean,
  overlap: boolean,
  overlapHalls: ReadonlySet<number> | null,
): string {
  const parts: string[] = [];
  if (isPreferred) {
    parts.push(isFirstSlot ? "Bevorzugt (primärer Slot)" : "Bevorzugt");
  } else {
    parts.push("Aushilfe (Ergänzung)");
  }
  if (overlap) {
    const hallList = overlapHalls && overlapHalls.size > 0
      ? ` mit Saal ${Array.from(overlapHalls).sort((a, b) => a - b).join(", ")}`
      : "";
    parts.push(`auch zur selben Zeit eingeteilt${hallList} — wechselt vorzeitig`);
  }
  return parts.join(" · ");
}

async function performPlanForShow(
  sb: SupabaseAdmin,
  showId: number
): Promise<PlanResult | null> {
  const { data: showRow } = await sb
    .from("cinema_cleaning_shows")
    .select("id, public_id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes, intensity, movie_title, notes")
    .eq("id", showId)
    .maybeSingle();
  if (!showRow) return null;
  const show = showRow as CleaningShow;

  const { data: staffRows } = await sb
    .from("cinema_cleaning_staff")
    .select("id, name, preference, color, is_active, user_id, notes, sort_order, work_start, work_end")
    .eq("is_active", true)
    .order("sort_order");
  const allActive = (staffRows ?? []) as CleaningStaff[];
  const staffById = new Map(allActive.map((s) => [s.id, s]));

  if (allActive.length === 0) {
    return {
      showId,
      recommendedCount: 0,
      assignments: [],
      source: "heuristic",
      aiNote: null,
      unmet: "Es sind keine aktiven Mitarbeiter angelegt.",
    };
  }

  const availabilityFilter = makeAvailabilityFilter(show);

  // Existierende Zuweisungen laden — manuelle bleiben unangetastet
  const { data: existing } = await sb
    .from("cinema_cleaning_assignments")
    .select("staff_id, assigned_by, reason")
    .eq("show_id", showId);
  const manuals = ((existing ?? []) as ExistingAssignment[]).filter(isManualAssignment);
  const manualStaffIds = new Set(manuals.map((m) => m.staff_id));
  const manualHasPreferred = manuals.some(
    (m) => staffById.get(m.staff_id)?.preference === "preferred",
  );

  // Externe Belegung (weiche Präferenz)
  const { busy: externalBusy, conflictHallNumbers } = await getExternalBusy(
    sb,
    show,
    new Set([showId]),
  );

  // Pool: Active MA, ohne die bereits manuell zugewiesenen
  const preferredPool = allActive
    .filter((s) => s.preference === "preferred" && !manualStaffIds.has(s.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  const backupPool = allActive
    .filter((s) => s.preference === "backup" && !manualStaffIds.has(s.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  // KI-Empfehlung für recommended_count (AI wählt nur die Anzahl + notes)
  const learning = await loadLearningData(sb, new Set([showId]));
  const { count: recommendedCount, aiNote, source } = await computeRecommendedCount(
    show,
    allActive,
    learning,
  );

  // Wie viele zusätzliche Slots braucht es noch (über manuelle hinaus)?
  const additionalNeeded = Math.max(0, recommendedCount - manuals.length);

  const usageCount = new Map<number, number>();
  const exclude = new Set<number>(manualStaffIds);
  const aiAdditional: Array<{ staff_id: number; reason: string }> = [];
  let preferredAddedHere = manualHasPreferred ? 1 : 0;

  for (let i = 0; i < additionalNeeded; i++) {
    // Priorität: preferred-strict → backup-strict → preferred-soft → backup-soft.
    // So vermeiden wir, dass derselbe MA in mehreren parallelen Sälen landet, solange
    // ein Backup ohne Konflikt verfügbar ist.
    const picked = pickByPriority(
      preferredPool,
      backupPool,
      exclude,
      externalBusy,
      usageCount,
      availabilityFilter,
    );
    if (!picked) break;
    const isFirstAiSlot = preferredAddedHere === 0;
    const reason = reasonForPickedSlot(picked.isPreferred, isFirstAiSlot, picked.overlap, conflictHallNumbers);
    aiAdditional.push({ staff_id: picked.staff.id, reason });
    exclude.add(picked.staff.id);
    if (picked.isPreferred) preferredAddedHere++;
  }

  // KI-Note + Konflikt-Hinweis zusammensetzen
  const conflictNote =
    conflictHallNumbers.size > 0
      ? `Überschneidung mit Saal ${Array.from(conflictHallNumbers).sort((a, b) => a - b).join(", ")} (weicher Konflikt — MA kann vorzeitig wechseln)`
      : null;
  const finalNote =
    aiNote && conflictNote ? `${aiNote} · ${conflictNote}` : aiNote ?? conflictNote;

  // Persistieren: nur KI-Zuweisungen entfernen, manuelle bleiben
  await sb
    .from("cinema_cleaning_assignments")
    .delete()
    .eq("show_id", showId)
    .eq("assigned_by", "ai");
  if (aiAdditional.length > 0) {
    await sb.from("cinema_cleaning_assignments").insert(
      aiAdditional.map((a) => ({
        show_id: showId,
        staff_id: a.staff_id,
        assigned_by: "ai" as const,
        reason: a.reason,
      })),
    );
  }

  const totalAssigned = manuals.length + aiAdditional.length;
  await sb
    .from("cinema_cleaning_shows")
    .update({
      ai_recommended_staff_count: recommendedCount,
      ai_notes: finalNote,
      plan_status: totalAssigned > 0 ? "planned" : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", showId);

  const unmetParts: string[] = [];
  if (totalAssigned < recommendedCount) {
    unmetParts.push(`Nur ${totalAssigned} von ${recommendedCount} empfohlenen Plätzen besetzt.`);
  }
  const totalPreferred =
    (manualHasPreferred ? manuals.filter((m) => staffById.get(m.staff_id)?.preference === "preferred").length : 0) +
    aiAdditional.filter((a) => staffById.get(a.staff_id)?.preference === "preferred").length;
  if (totalPreferred === 0 && totalAssigned > 0) {
    unmetParts.push("Kein bevorzugter MA in diesem Auslass.");
  }

  return {
    showId,
    recommendedCount,
    assignments: [
      ...manuals.map((m) => ({ staff_id: m.staff_id, reason: m.reason ?? "Manuell zugewiesen" })),
      ...aiAdditional,
    ],
    source,
    aiNote: finalNote,
    unmet: unmetParts.length > 0 ? unmetParts.join(" ") : undefined,
  };
}

export async function planShowAction(formData: FormData): Promise<PlanResult | null> {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return null;
  const sb = createAdminClient();
  const result = await performPlanForShow(sb, showId);
  revalidatePath(PLAN_PATH);
  return result;
}

export type BulkPlanSummary = {
  total: number;
  planned: number;
  empty: number;
  failed: number;
  bySource: { ai: number; heuristic: number };
  results: Array<{
    showId: number;
    hallNumber: number | null;
    showDate: string | null;
    endTime: string | null;
    ok: boolean;
    source: "ai" | "heuristic" | null;
    assignedCount: number;
    recommendedCount: number;
    unmet?: string;
    error?: string;
  }>;
};

export async function planManyShowsAction(formData: FormData): Promise<BulkPlanSummary> {
  await assertCallerHasCinemaAccess();
  const rawIds = formData.getAll("show_id").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  const showIds = Array.from(new Set(rawIds));
  const emptySummary: BulkPlanSummary = {
    total: 0, planned: 0, empty: 0, failed: 0, bySource: { ai: 0, heuristic: 0 }, results: [],
  };
  if (showIds.length === 0) return emptySummary;

  const sb = createAdminClient();
  const showIdSet = new Set(showIds);

  // Chronologisch laden
  const { data: showRows } = await sb
    .from("cinema_cleaning_shows")
    .select("id, public_id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes, intensity, movie_title, notes")
    .in("id", showIds)
    .order("show_date", { ascending: true })
    .order("end_time", { ascending: true });
  const shows = (showRows ?? []) as CleaningShow[];
  if (shows.length === 0) return emptySummary;

  // Aktive MA
  const { data: staffRows } = await sb
    .from("cinema_cleaning_staff")
    .select("id, name, preference, color, is_active, user_id, notes, sort_order, work_start, work_end")
    .eq("is_active", true)
    .order("sort_order");
  const allActive = (staffRows ?? []) as CleaningStaff[];
  const staffById = new Map(allActive.map((s) => [s.id, s]));

  if (allActive.length === 0) {
    return {
      ...emptySummary,
      total: shows.length,
      empty: shows.length,
      results: shows.map((s) => ({
        showId: s.id,
        hallNumber: s.hall_number,
        showDate: s.show_date,
        endTime: s.end_time,
        ok: false,
        source: null,
        assignedCount: 0,
        recommendedCount: 0,
        error: "Keine aktiven Mitarbeiter angelegt.",
      })),
    };
  }
  const preferredPool = allActive.filter((s) => s.preference === "preferred");
  const backupPool = allActive.filter((s) => s.preference === "backup");

  // Bestehende Zuweisungen für alle Batch-Vorstellungen laden
  const { data: existingAll } = await sb
    .from("cinema_cleaning_assignments")
    .select("show_id, staff_id, assigned_by, reason")
    .in("show_id", showIds);
  const manualByShow = new Map<number, ExistingAssignment[]>();
  for (const a of existingAll ?? []) {
    const row = a as { show_id: number } & ExistingAssignment;
    if (!isManualAssignment(row)) continue;
    if (!manualByShow.has(row.show_id)) manualByShow.set(row.show_id, []);
    manualByShow.get(row.show_id)!.push(row);
  }

  // KI-Zuweisungen der Batch-Vorstellungen entfernen (manuelle bleiben)
  await sb
    .from("cinema_cleaning_assignments")
    .delete()
    .in("show_id", showIds)
    .eq("assigned_by", "ai");

  // Lerndaten einmal laden
  const learning = await loadLearningData(sb, showIdSet);

  // Pro Show: empfohlene Anzahl per KI/Heuristik (parallel)
  type Item = {
    show: CleaningShow;
    recommendedCount: number;
    aiNote: string | null;
    countSource: "ai" | "heuristic";
    currentStaffIds: Set<number>;
    currentPreferredCount: number;
    manualEntries: ExistingAssignment[];
    newAssignments: Array<{ staff_id: number; reason: string }>;
    externalBusy: Set<number>;
    conflictHallNumbers: Set<number>;
  };

  const items: Item[] = await Promise.all(
    shows.map(async (show): Promise<Item> => {
      const manuals = manualByShow.get(show.id) ?? [];
      const manualStaffIds = new Set(manuals.map((m) => m.staff_id));
      const manualPreferredCount = manuals.filter(
        (m) => staffById.get(m.staff_id)?.preference === "preferred",
      ).length;
      const { busy, conflictHallNumbers } = await getExternalBusy(sb, show, showIdSet);
      const { count, aiNote, source } = await computeRecommendedCount(show, allActive, learning);
      return {
        show,
        recommendedCount: count,
        aiNote,
        countSource: source,
        currentStaffIds: new Set(manualStaffIds),
        currentPreferredCount: manualPreferredCount,
        manualEntries: manuals,
        newAssignments: [],
        externalBusy: busy,
        conflictHallNumbers,
      };
    }),
  );

  // Usage-Map für Spreading
  const usageCount = new Map<number, number>();
  for (const it of items) {
    for (const sid of it.currentStaffIds) {
      usageCount.set(sid, (usageCount.get(sid) ?? 0) + 1);
    }
  }

  function softBusyForItem(item: Item): Set<number> {
    const busy = new Set<number>(item.externalBusy);
    for (const other of items) {
      if (other === item) continue;
      if (windowsOverlap(item.show, other.show)) {
        for (const sid of other.currentStaffIds) busy.add(sid);
      }
    }
    return busy;
  }

  function overlapHallsForItem(item: Item): Set<number> {
    const halls = new Set<number>(item.conflictHallNumbers);
    for (const other of items) {
      if (other === item) continue;
      if (other.currentStaffIds.size === 0) continue;
      if (windowsOverlap(item.show, other.show)) {
        halls.add(other.show.hall_number);
      }
    }
    return halls;
  }

  // Phase 1: jede Vorstellung bekommt 1 preferred OHNE Konflikt (wenn möglich).
  // Wenn alle preferred bereits in parallelen Sälen sind, überlassen wir das
  // Auffüllen Phase 2 — die nutzt dann erst Backup-strikt, bevor sie auf Overlap
  // zurückgreift. So vermeiden wir, denselben preferred MA in mehrere überlappende
  // Sale zu stapeln, solange Alternativen existieren.
  for (const it of items) {
    if (it.currentPreferredCount > 0) continue;
    if (it.currentStaffIds.size >= it.recommendedCount) continue;
    const softBusy = softBusyForItem(it);
    const availability = makeAvailabilityFilter(it.show);
    const picked = pickFromPool(preferredPool, it.currentStaffIds, softBusy, usageCount, availability);
    if (!picked) continue;
    const reason = reasonForPickedSlot(true, true, picked.overlap, overlapHallsForItem(it));
    it.newAssignments.push({ staff_id: picked.staff.id, reason });
    it.currentStaffIds.add(picked.staff.id);
    it.currentPreferredCount++;
    usageCount.set(picked.staff.id, (usageCount.get(picked.staff.id) ?? 0) + 1);
  }

  // Phase 2: restliche Slots auffüllen. Priorität:
  //   1. preferred ohne Konflikt
  //   2. backup ohne Konflikt
  //   3. preferred mit Konflikt (Notfall — MA wechselt vorzeitig)
  //   4. backup mit Konflikt (letzter Ausweg)
  for (const it of items) {
    const availability = makeAvailabilityFilter(it.show);
    while (it.currentStaffIds.size < it.recommendedCount) {
      const softBusy = softBusyForItem(it);
      const picked = pickByPriority(
        preferredPool,
        backupPool,
        it.currentStaffIds,
        softBusy,
        usageCount,
        availability,
      );
      if (!picked) break;
      const isFirstAi = it.newAssignments.length === 0 && it.manualEntries.length === 0;
      const reason = reasonForPickedSlot(picked.isPreferred, isFirstAi, picked.overlap, overlapHallsForItem(it));
      it.newAssignments.push({ staff_id: picked.staff.id, reason });
      it.currentStaffIds.add(picked.staff.id);
      if (picked.isPreferred) it.currentPreferredCount++;
      usageCount.set(picked.staff.id, (usageCount.get(picked.staff.id) ?? 0) + 1);
    }
  }

  // Persistieren
  const inserts: Array<{ show_id: number; staff_id: number; assigned_by: "ai"; reason: string }> = [];
  for (const it of items) {
    for (const a of it.newAssignments) {
      inserts.push({ show_id: it.show.id, staff_id: a.staff_id, assigned_by: "ai", reason: a.reason });
    }
  }
  if (inserts.length > 0) {
    await sb.from("cinema_cleaning_assignments").insert(inserts);
  }

  // Show-Status updaten
  const summary: BulkPlanSummary = {
    total: shows.length, planned: 0, empty: 0, failed: 0, bySource: { ai: 0, heuristic: 0 }, results: [],
  };
  for (const it of items) {
    const totalAssigned = it.currentStaffIds.size;
    const conflictNote =
      it.conflictHallNumbers.size > 0
        ? `Überschneidung mit Saal ${Array.from(it.conflictHallNumbers).sort((a, b) => a - b).join(", ")} (weicher Konflikt)`
        : null;
    const finalNote =
      it.aiNote && conflictNote ? `${it.aiNote} · ${conflictNote}` : it.aiNote ?? conflictNote;
    await sb
      .from("cinema_cleaning_shows")
      .update({
        ai_recommended_staff_count: it.recommendedCount,
        ai_notes: finalNote,
        plan_status: totalAssigned > 0 ? "planned" : "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", it.show.id);

    if (totalAssigned > 0) summary.planned++;
    else summary.empty++;
    summary.bySource[it.countSource]++;

    const unmetParts: string[] = [];
    if (totalAssigned < it.recommendedCount) {
      unmetParts.push(`Nur ${totalAssigned} von ${it.recommendedCount}.`);
    }
    if (it.currentPreferredCount === 0 && totalAssigned > 0) {
      unmetParts.push("Kein bevorzugter MA verfügbar.");
    }

    summary.results.push({
      showId: it.show.id,
      hallNumber: it.show.hall_number,
      showDate: it.show.show_date,
      endTime: it.show.end_time,
      ok: totalAssigned > 0,
      source: it.countSource,
      assignedCount: totalAssigned,
      recommendedCount: it.recommendedCount,
      unmet: unmetParts.length > 0 ? unmetParts.join(" ") : undefined,
    });
  }

  revalidatePath(PLAN_PATH);
  return summary;
}

// ── Manuelle Zuweisungen ──────────────────────────────────────────────

// Setzt die manuellen Zuweisungen für eine Vorstellung exakt auf die übergebene
// Mitarbeiter-Liste. Bestehende KI-Zuweisungen werden entfernt — der Nutzer hat
// damit volle Kontrolle und kann anschließend mit "KI-Plan" auffüllen lassen.
export async function setManualAssignmentsAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return;
  const staffIds = Array.from(new Set(
    formData
      .getAll("staff_id")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0),
  ));

  const sb = createAdminClient();
  // Alle bisherigen Zuweisungen wegräumen (manuelle und KI)
  await sb.from("cinema_cleaning_assignments").delete().eq("show_id", showId);

  if (staffIds.length > 0) {
    await sb.from("cinema_cleaning_assignments").insert(
      staffIds.map((id) => ({
        show_id: showId,
        staff_id: id,
        assigned_by: "manual" as const,
        reason: "Manuell zugewiesen",
      })),
    );
  }

  await sb
    .from("cinema_cleaning_shows")
    .update({
      plan_status: staffIds.length > 0 ? "planned" : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", showId);
  revalidatePath(PLAN_PATH);
}

// Entfernt eine einzelne Zuweisung (Mitarbeiter aus einer Vorstellung).
export async function removeAssignmentAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  const staffId = Number(formData.get("staff_id"));
  if (!showId || !staffId) return;
  const sb = createAdminClient();
  await sb
    .from("cinema_cleaning_assignments")
    .delete()
    .eq("show_id", showId)
    .eq("staff_id", staffId);
  // Wenn dadurch keine Zuweisung mehr übrig ist, plan_status auf "open" zurücksetzen
  const { count } = await sb
    .from("cinema_cleaning_assignments")
    .select("*", { count: "exact", head: true })
    .eq("show_id", showId);
  if ((count ?? 0) === 0) {
    await sb
      .from("cinema_cleaning_shows")
      .update({ plan_status: "open", updated_at: new Date().toISOString() })
      .eq("id", showId);
  } else {
    await sb
      .from("cinema_cleaning_shows")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", showId);
  }
  revalidatePath(PLAN_PATH);
}

// Löscht Einträge aus dem Lerndaten-Archiv. Standardmäßig nur mit Datumsfilter
// erlaubt — für "alle löschen" muss explicit scope=all gesetzt sein. Erfordert
// immer die exakte Bestätigungs-Phrase "ARCHIV LEEREN".
export async function clearArchiveAction(
  formData: FormData,
): Promise<{ deleted: number; error?: string }> {
  await assertCallerHasCinemaAccess();
  const phrase = String(formData.get("confirm") || "").trim();
  if (phrase !== "ARCHIV LEEREN") {
    return { deleted: 0, error: "Bestätigungs-Phrase fehlt oder falsch." };
  }
  const dateFrom = String(formData.get("date_from") || "").trim();
  const dateTo = String(formData.get("date_to") || "").trim();
  const scope = String(formData.get("scope") || "").trim();
  const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom);
  const validTo = /^\d{4}-\d{2}-\d{2}$/.test(dateTo);

  // Sicherheit: entweder Datumsfilter ODER explicit scope=all
  if (!validFrom && !validTo && scope !== "all") {
    return { deleted: 0, error: "Bitte Zeitraum wählen oder 'Alle Einträge' markieren." };
  }

  const sb = createAdminClient();

  // Treffer-Anzahl ermitteln (für die Rückgabe)
  let countQ = sb
    .from("cinema_cleaning_learning_archive")
    .select("*", { count: "exact", head: true });
  if (validFrom) countQ = countQ.gte("show_date", dateFrom);
  if (validTo) countQ = countQ.lte("show_date", dateTo);
  const { count } = await countQ;

  // Eigentlicher Delete
  let delQ = sb.from("cinema_cleaning_learning_archive").delete();
  if (validFrom) delQ = delQ.gte("show_date", dateFrom);
  if (validTo) delQ = delQ.lte("show_date", dateTo);
  if (!validFrom && !validTo) delQ = delQ.gt("id", 0); // scope=all
  await delQ;

  revalidatePath("/tools/auslassplanung/lerndaten");
  revalidatePath(PLAN_PATH);
  return { deleted: count ?? 0 };
}

// Entfernt alle Zuweisungen für eine Liste von Vorstellungen. Die
// show_ids werden im FormData unter "show_id" (mehrfach) erwartet.
// Setzt den plan_status der betroffenen Shows zurück auf "open".
export async function clearAssignmentsForShowsAction(
  formData: FormData,
): Promise<{ cleared: number }> {
  await assertCallerHasCinemaAccess();
  const showIds = Array.from(
    new Set(
      formData
        .getAll("show_id")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  if (showIds.length === 0) return { cleared: 0 };
  const sb = createAdminClient();
  await sb.from("cinema_cleaning_assignments").delete().in("show_id", showIds);
  await sb
    .from("cinema_cleaning_shows")
    .update({ plan_status: "open", updated_at: new Date().toISOString() })
    .in("id", showIds);
  revalidatePath(PLAN_PATH);
  return { cleared: showIds.length };
}

// Entfernt alle Zuweisungen (manuell + KI) für eine Vorstellung.
export async function clearAssignmentsAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return;
  const sb = createAdminClient();
  await sb.from("cinema_cleaning_assignments").delete().eq("show_id", showId);
  await sb
    .from("cinema_cleaning_shows")
    .update({
      plan_status: "open",
      ai_notes: null,
      ai_recommended_staff_count: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", showId);
  revalidatePath(PLAN_PATH);
}

// ── FÜP-Import ────────────────────────────────────────────────────────

export type FupParseActionResult =
  | { ok: true; result: FupParseResult }
  | { ok: false; error: string };

export async function parseFupAction(formData: FormData): Promise<FupParseActionResult> {
  await assertCallerHasCinemaAccess();
  if (!fupImportEnabled()) {
    return { ok: false, error: "GEMINI_API_KEY ist nicht gesetzt — FÜP-Import nicht verfügbar." };
  }
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Bitte ein Bild hochladen." };
  }
  // Sicherheit: max ~6MB (Server-Action body limit greift davor)
  if (file.size > 6 * 1024 * 1024) {
    return { ok: false, error: "Bild zu groß (max 6 MB). Bitte kleiner skalieren." };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
  const dataUri = `data:${mime};base64,${buf.toString("base64")}`;

  try {
    const result = await analyzeFupImage({ dataUri });
    return { ok: true, result };
  } catch (e) {
    console.error("[auslassplanung] FÜP parse failed", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "FÜP konnte nicht ausgewertet werden.",
    };
  }
}

export type FupCreateRow = {
  hall_number: number;
  end_time: string;
  cleanup_minutes: number;
  movie_title: string | null;
  intensity: "light" | "standard" | "intense";
  attendees: number;
};

export async function createShowsFromFupAction(formData: FormData): Promise<{ created: number }> {
  const user = await assertCallerHasCinemaAccess();
  const showDate = String(formData.get("show_date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return { created: 0 };

  const payload = String(formData.get("shows") || "[]");
  let rows: unknown;
  try {
    rows = JSON.parse(payload);
  } catch {
    return { created: 0 };
  }
  if (!Array.isArray(rows)) return { created: 0 };

  const sb = createAdminClient();
  const inserts = rows
    .map((r): FupCreateRow | null => {
      if (!r || typeof r !== "object") return null;
      const row = r as Record<string, unknown>;
      const hall = Number(row.hall_number);
      const endTimeRaw = String(row.end_time ?? "");
      const m = endTimeRaw.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const endTime = `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
      if (!Number.isFinite(hall) || hall <= 0) return null;
      const cleanup = Math.max(1, Math.round(Number(row.cleanup_minutes ?? 15) || 15));
      const titleRaw = row.movie_title;
      const movieTitle =
        typeof titleRaw === "string" && titleRaw.trim().length > 0 ? titleRaw.trim() : null;
      const intensityRaw = row.intensity;
      const intensity: "light" | "standard" | "intense" =
        intensityRaw === "light" || intensityRaw === "intense" ? intensityRaw : "standard";
      const attendees = Math.max(0, Math.round(Number(row.attendees ?? 0) || 0));
      return {
        hall_number: Math.round(hall),
        end_time: endTime,
        cleanup_minutes: cleanup,
        movie_title: movieTitle,
        intensity,
        attendees,
      };
    })
    .filter((x): x is FupCreateRow => x !== null);

  if (inserts.length === 0) return { created: 0 };

  // Pro Zeile einen eindeutigen public_id-Code erzeugen
  const codes: string[] = [];
  for (let i = 0; i < inserts.length; i++) {
    codes.push(await generateUniquePublicId(sb));
  }

  await sb.from("cinema_cleaning_shows").insert(
    inserts.map((r, i) => ({
      public_id: codes[i],
      show_date: showDate,
      hall_number: r.hall_number,
      hall_label: null,
      end_time: r.end_time,
      attendees: r.attendees,
      cleanup_minutes: r.cleanup_minutes,
      intensity: r.intensity,
      movie_title: r.movie_title,
      notes: "Aus FÜP-Import",
      plan_status: "open" as const,
      created_by: user.id,
    })),
  );

  revalidatePath(PLAN_PATH);
  return { created: inserts.length };
}

// ── Besucherzahlen ────────────────────────────────────────────────────

export async function updateAttendeesAction(formData: FormData): Promise<{ updated: number }> {
  await assertCallerHasCinemaAccess();
  // Payload: shows = JSON-Array von { id, attendees }
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("shows") || "[]"));
  } catch {
    return { updated: 0 };
  }
  if (!Array.isArray(payload)) return { updated: 0 };

  const sb = createAdminClient();
  let updated = 0;
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = Number(r.id);
    const attendees = Number(r.attendees);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(attendees)) continue;
    await sb
      .from("cinema_cleaning_shows")
      .update({
        attendees: Math.max(0, Math.round(attendees)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    updated++;
  }
  revalidatePath(PLAN_PATH);
  return { updated };
}

export type AttendeesEstimateActionResult =
  | { ok: true; estimates: Array<{ show_id: number; attendees: number; reason?: string }>; notes?: string }
  | { ok: false; error: string };

export async function estimateAttendeesAction(
  formData: FormData,
): Promise<AttendeesEstimateActionResult> {
  await assertCallerHasCinemaAccess();
  if (!attendeesAiEnabled()) {
    return { ok: false, error: "GEMINI_API_KEY ist nicht gesetzt — KI-Schätzung nicht verfügbar." };
  }
  const ids = formData
    .getAll("show_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return { ok: false, error: "Keine Vorstellungen ausgewählt." };

  const sb = createAdminClient();
  const { data: showRows } = await sb
    .from("cinema_cleaning_shows")
    .select("id, hall_number, end_time, cleanup_minutes, intensity, movie_title")
    .in("id", ids);
  if (!showRows || showRows.length === 0) {
    return { ok: false, error: "Vorstellungen nicht gefunden." };
  }

  // Lerndaten: vergangene Vorstellungen mit attendees > 0 (echte Werte)
  // — kombiniert aus aktiven Shows und dem Archiv.
  const [{ data: pastShows }, { data: pastArchive }] = await Promise.all([
    sb
      .from("cinema_cleaning_shows")
      .select("id, show_date, hall_number, end_time, intensity, movie_title, attendees")
      .gt("attendees", 0)
      .not("id", "in", `(${ids.join(",")})`)
      .order("show_date", { ascending: false })
      .limit(LEARNING_LIMIT),
    sb
      .from("cinema_cleaning_learning_archive")
      .select("show_date, hall_number, end_time, intensity, movie_title, attendees")
      .gt("attendees", 0)
      .order("show_date", { ascending: false })
      .limit(LEARNING_LIMIT),
  ]);
  type LearningWithDate = {
    hall_number: number;
    end_time: string;
    intensity: string;
    movie_title: string | null;
    attendees: number;
    _sortKey: string;
  };
  const fromActive: LearningWithDate[] = (pastShows ?? []).map((r: any) => ({
    hall_number: r.hall_number as number,
    end_time: r.end_time as string,
    intensity: r.intensity as string,
    movie_title: (r.movie_title as string | null) ?? null,
    attendees: r.attendees as number,
    _sortKey: r.show_date as string,
  }));
  const fromArchive: LearningWithDate[] = (pastArchive ?? []).map((r: any) => ({
    hall_number: r.hall_number as number,
    end_time: r.end_time as string,
    intensity: r.intensity as string,
    movie_title: (r.movie_title as string | null) ?? null,
    attendees: r.attendees as number,
    _sortKey: r.show_date as string,
  }));
  const learning = [...fromActive, ...fromArchive]
    .sort((a, b) => b._sortKey.localeCompare(a._sortKey))
    .slice(0, LEARNING_LIMIT)
    .map(({ _sortKey, ...rest }) => {
      void _sortKey;
      return rest;
    });

  try {
    const result = await estimateAttendeesWithAi({
      shows: showRows.map((s) => ({
        id: s.id as number,
        hall_number: s.hall_number as number,
        end_time: s.end_time as string,
        cleanup_minutes: s.cleanup_minutes as number,
        intensity: s.intensity as "light" | "standard" | "intense",
        movie_title: (s.movie_title as string | null) ?? null,
      })),
      learning,
    });
    if (!result) return { ok: false, error: "KI hat keine Antwort geliefert." };
    return { ok: true, estimates: result.estimates, notes: result.notes };
  } catch (e) {
    console.error("[auslassplanung] attendees estimate failed", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "KI-Schätzung fehlgeschlagen.",
    };
  }
}

// ── Feedback (Lerndaten) ──────────────────────────────────────────────

export async function saveFeedbackAction(formData: FormData) {
  const user = await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return;
  const actualStaffCount = Math.max(0, Number(formData.get("actual_staff_count") || 0));
  const actualDuration = formData.get("actual_duration_minutes");
  const actualDurationMinutes =
    actualDuration !== null && actualDuration !== ""
      ? Math.max(0, Number(actualDuration) || 0)
      : null;
  const rating = formData.get("rating");
  const ratingValue =
    rating !== null && rating !== "" ? Math.min(5, Math.max(1, Number(rating) || 0)) : null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const sb = createAdminClient();
  await sb.from("cinema_cleaning_feedback").upsert(
    {
      show_id: showId,
      actual_staff_count: actualStaffCount,
      actual_duration_minutes: actualDurationMinutes,
      rating: ratingValue,
      notes,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    },
    { onConflict: "show_id" }
  );
  await sb
    .from("cinema_cleaning_shows")
    .update({ plan_status: "completed", updated_at: new Date().toISOString() })
    .eq("id", showId);
  revalidatePath(PLAN_PATH);
}
