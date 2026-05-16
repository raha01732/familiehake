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
} from "./utils";
import {
  generateCleaningPlanWithAi,
  auslassplanungAiEnabled,
} from "@/lib/auslassplanung/ai";

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

// ── Staff CRUD ────────────────────────────────────────────────────────

export async function createStaffAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const preference = String(formData.get("preference") || "preferred") === "backup" ? "backup" : "preferred";
  const color = String(formData.get("color") || "#06b6d4").trim();
  const userId = String(formData.get("user_id") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

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
  await sb.from("cinema_cleaning_shows").insert({
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
  await sb.from("cinema_cleaning_shows").delete().eq("id", id);
  revalidatePath(PLAN_PATH);
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

export async function planShowAction(formData: FormData): Promise<PlanResult | null> {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return null;

  const sb = createAdminClient();
  const { data: showRow } = await sb
    .from("cinema_cleaning_shows")
    .select("id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes, intensity, movie_title, notes")
    .eq("id", showId)
    .maybeSingle();
  if (!showRow) return null;
  const show = showRow as CleaningShow;

  const { data: staffRows } = await sb
    .from("cinema_cleaning_staff")
    .select("id, name, preference, color, is_active, user_id, notes, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  const staffList = (staffRows ?? []) as CleaningStaff[];
  if (staffList.length === 0) {
    return {
      showId,
      recommendedCount: 0,
      assignments: [],
      source: "heuristic",
      aiNote: null,
      unmet: "Es sind keine aktiven Reinigungs-Mitarbeiter angelegt.",
    };
  }

  // Lerndaten: letzte 20 abgeschlossene Shows mit Feedback
  const { data: pastRows } = await sb
    .from("cinema_cleaning_shows")
    .select(`
      id, hall_number, attendees, cleanup_minutes, intensity, movie_title,
      cinema_cleaning_feedback ( actual_staff_count, actual_duration_minutes, rating, notes )
    `)
    .neq("id", showId)
    .order("show_date", { ascending: false })
    .limit(20);
  const learning =
    (pastRows ?? [])
      .map((row: any) => {
        const fb = Array.isArray(row.cinema_cleaning_feedback)
          ? row.cinema_cleaning_feedback[0]
          : row.cinema_cleaning_feedback;
        if (!fb) return null;
        return {
          hall_number: row.hall_number as number,
          attendees: row.attendees as number,
          cleanup_minutes: row.cleanup_minutes as number,
          intensity: row.intensity as string,
          movie_title: (row.movie_title as string | null) ?? null,
          actual_staff_count: fb.actual_staff_count as number,
          actual_duration_minutes: (fb.actual_duration_minutes as number | null) ?? null,
          rating: (fb.rating as number | null) ?? null,
          notes: (fb.notes as string | null) ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

  let result: PlanResult | null = null;
  let source: "ai" | "heuristic" = "heuristic";
  let aiNote: string | null = null;
  let recommendedCount = recommendStaffCount(show.attendees, show.intensity);
  let chosen: { staff_id: number; reason: string | null }[] = [];

  if (auslassplanungAiEnabled()) {
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
        staff: staffList.map((s) => ({
          id: s.id,
          name: s.name,
          preference: s.preference,
          notes: s.notes,
        })),
        learning,
      });
      if (aiResult) {
        recommendedCount = aiResult.recommended_staff_count;
        chosen = aiResult.assignments
          .map((a) => ({ staff_id: a.staff_id, reason: a.reason ?? null }))
          .filter((a) => staffList.some((s) => s.id === a.staff_id));
        aiNote = aiResult.notes ?? null;
        source = "ai";
      }
    } catch (e) {
      console.error("[auslassplanung] ai call failed, falling back to heuristic", e);
    }
  }

  if (source === "heuristic") {
    // Heuristik: erst preferred, dann backup, sortiert nach sort_order
    const sorted = [...staffList].sort((a, b) => {
      if (a.preference !== b.preference) return a.preference === "preferred" ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
    chosen = sorted.slice(0, recommendedCount).map((s) => ({
      staff_id: s.id,
      reason: s.preference === "preferred" ? "Heuristik: bevorzugt" : "Heuristik: Zweifelsfall",
    }));
  }

  // Alte Zuweisungen löschen, neue setzen
  await sb.from("cinema_cleaning_assignments").delete().eq("show_id", showId);
  if (chosen.length > 0) {
    await sb.from("cinema_cleaning_assignments").insert(
      chosen.map((c) => ({
        show_id: showId,
        staff_id: c.staff_id,
        assigned_by: source === "ai" ? "ai" : "manual",
        reason: c.reason,
      }))
    );
  }
  await sb
    .from("cinema_cleaning_shows")
    .update({
      ai_recommended_staff_count: recommendedCount,
      ai_notes: aiNote,
      plan_status: chosen.length > 0 ? "planned" : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", showId);

  result = {
    showId,
    recommendedCount,
    assignments: chosen,
    source,
    aiNote,
    unmet:
      chosen.length < recommendedCount
        ? `Nur ${chosen.length} von ${recommendedCount} empfohlenen Plätzen besetzt.`
        : undefined,
  };

  revalidatePath(PLAN_PATH);
  return result;
}

export async function manualOverrideAssignmentAction(formData: FormData) {
  await assertCallerHasCinemaAccess();
  const showId = Number(formData.get("show_id"));
  if (!showId) return;
  const staffIds = formData
    .getAll("staff_id")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const sb = createAdminClient();
  await sb.from("cinema_cleaning_assignments").delete().eq("show_id", showId);
  if (staffIds.length > 0) {
    await sb.from("cinema_cleaning_assignments").insert(
      staffIds.map((id) => ({
        show_id: showId,
        staff_id: id,
        assigned_by: "override" as const,
      }))
    );
    await sb
      .from("cinema_cleaning_shows")
      .update({ plan_status: "planned", updated_at: new Date().toISOString() })
      .eq("id", showId);
  } else {
    await sb
      .from("cinema_cleaning_shows")
      .update({ plan_status: "open", updated_at: new Date().toISOString() })
      .eq("id", showId);
  }
  revalidatePath(PLAN_PATH);
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
