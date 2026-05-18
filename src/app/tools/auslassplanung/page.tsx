import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import RoleGate from "@/components/RoleGate";
import AuslassplanungClient from "./AuslassplanungClient";
import { auslassplanungAiEnabled } from "@/lib/auslassplanung/ai";
import { fupImportEnabled } from "@/lib/auslassplanung/fup";
import {
  createShowAction,
  updateShowAction,
  deleteShowAction,
  deleteAllShowsAction,
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  moveStaffAction,
  planShowAction,
  planManyShowsAction,
  setManualAssignmentsAction,
  removeAssignmentAction,
  clearAssignmentsAction,
  parseFupAction,
  createShowsFromFupAction,
  updateAttendeesAction,
  estimateAttendeesAction,
  archiveFeedbackAction,
  saveFeedbackAction,
} from "./actions";
import {
  type CleaningAssignment,
  type CleaningFeedback,
  type CleaningShow,
  type CleaningStaff,
  compareShowsByCinemaDay,
  currentCinemaDate,
} from "./utils";

export const metadata = { title: "Auslassplanung" };
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AuslassplanungPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin =
    role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;
  const hasCinema =
    isAdmin || role === "cinema";

  const requestedDate = params.date && DATE_RE.test(params.date) ? params.date : null;
  const todayCinema = currentCinemaDate();

  const sb = createAdminClient();

  // 1) Staff lädt komplett — der Tab ist tagesunabhängig
  // 2) Shows nur des selektierten Tages (oder heute) für Performance
  // 3) Liste aller vorhandenen Datümer für den Selector
  const targetDate = requestedDate ?? todayCinema;

  const [staffResult, showsResult, availableDatesResult] = await Promise.all([
    sb
      .from("cinema_cleaning_staff")
      .select("id, name, preference, color, is_active, user_id, notes, sort_order, work_start, work_end")
      .order("sort_order")
      .order("id"),
    sb
      .from("cinema_cleaning_shows")
      .select(
        "id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes, intensity, movie_title, notes, plan_status, ai_recommended_staff_count, ai_notes",
      )
      .eq("show_date", targetDate),
    sb
      .from("cinema_cleaning_shows")
      .select("show_date")
      .order("show_date", { ascending: false }),
  ]);

  const staff = (staffResult.data ?? []) as CleaningStaff[];
  const shows = ((showsResult.data ?? []) as CleaningShow[])
    .slice()
    .sort(compareShowsByCinemaDay);

  const visibleShowIds = shows.map((s) => s.id);

  // Assignments + Feedback nur für die sichtbaren Shows laden (oder gar nicht, wenn leer)
  const [assignmentsResult, feedbackResult] =
    visibleShowIds.length > 0
      ? await Promise.all([
          sb
            .from("cinema_cleaning_assignments")
            .select("id, show_id, staff_id, assigned_by, reason, created_at")
            .in("show_id", visibleShowIds),
          sb
            .from("cinema_cleaning_feedback")
            .select("show_id, actual_staff_count, actual_duration_minutes, rating, notes, recorded_at")
            .in("show_id", visibleShowIds),
        ])
      : [{ data: [] as CleaningAssignment[] }, { data: [] as CleaningFeedback[] }];

  const assignments = (assignmentsResult.data ?? []) as CleaningAssignment[];
  const feedback = (feedbackResult.data ?? []) as CleaningFeedback[];

  // Verfügbare Datümer (dedupliziert), absteigend
  const availableDates = Array.from(
    new Set(
      (availableDatesResult.data ?? [])
        .map((r) => (r as { show_date: string }).show_date)
        .filter(Boolean),
    ),
  ).sort((a, b) => b.localeCompare(a));

  return (
    <RoleGate routeKey="tools/auslassplanung">
      <AuslassplanungClient
        initialStaff={staff}
        initialShows={shows}
        initialAssignments={assignments}
        initialFeedback={feedback}
        selectedDate={targetDate}
        todayDate={todayCinema}
        availableDates={availableDates}
        canEdit={hasCinema}
        aiEnabled={auslassplanungAiEnabled()}
        fupImportEnabled={fupImportEnabled()}
        createStaffAction={createStaffAction}
        updateStaffAction={updateStaffAction}
        deleteStaffAction={deleteStaffAction}
        moveStaffAction={moveStaffAction}
        createShowAction={createShowAction}
        updateShowAction={updateShowAction}
        deleteShowAction={deleteShowAction}
        deleteAllShowsAction={deleteAllShowsAction}
        planShowAction={planShowAction}
        planManyShowsAction={planManyShowsAction}
        setManualAssignmentsAction={setManualAssignmentsAction}
        removeAssignmentAction={removeAssignmentAction}
        clearAssignmentsAction={clearAssignmentsAction}
        parseFupAction={parseFupAction}
        createShowsFromFupAction={createShowsFromFupAction}
        updateAttendeesAction={updateAttendeesAction}
        estimateAttendeesAction={estimateAttendeesAction}
        archiveFeedbackAction={archiveFeedbackAction}
        saveFeedbackAction={saveFeedbackAction}
      />
    </RoleGate>
  );
}
