import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import RoleGate from "@/components/RoleGate";
import AuslassplanungClient from "./AuslassplanungClient";
import { auslassplanungAiEnabled } from "@/lib/auslassplanung/ai";
import {
  createShowAction,
  updateShowAction,
  deleteShowAction,
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  planShowAction,
  manualOverrideAssignmentAction,
  saveFeedbackAction,
} from "./actions";
import type {
  CleaningAssignment,
  CleaningFeedback,
  CleaningShow,
  CleaningStaff,
} from "./utils";

export const metadata = { title: "Auslassplanung" };
export const dynamic = "force-dynamic";

export default async function AuslassplanungPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin =
    role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;
  const hasCinema =
    isAdmin || role === "cinema";

  const sb = createAdminClient();
  const [staffResult, showsResult, assignmentsResult, feedbackResult] = await Promise.all([
    sb
      .from("cinema_cleaning_staff")
      .select("id, name, preference, color, is_active, user_id, notes, sort_order")
      .order("sort_order")
      .order("id"),
    sb
      .from("cinema_cleaning_shows")
      .select(
        "id, show_date, hall_number, hall_label, end_time, attendees, cleanup_minutes, intensity, movie_title, notes, plan_status, ai_recommended_staff_count, ai_notes"
      )
      .order("show_date", { ascending: false })
      .order("end_time"),
    sb
      .from("cinema_cleaning_assignments")
      .select("id, show_id, staff_id, assigned_by, reason, created_at"),
    sb
      .from("cinema_cleaning_feedback")
      .select("show_id, actual_staff_count, actual_duration_minutes, rating, notes, recorded_at"),
  ]);

  const staff = (staffResult.data ?? []) as CleaningStaff[];
  const shows = (showsResult.data ?? []) as CleaningShow[];
  const assignments = (assignmentsResult.data ?? []) as CleaningAssignment[];
  const feedback = (feedbackResult.data ?? []) as CleaningFeedback[];

  return (
    <RoleGate routeKey="tools/auslassplanung">
      <AuslassplanungClient
        initialStaff={staff}
        initialShows={shows}
        initialAssignments={assignments}
        initialFeedback={feedback}
        canEdit={hasCinema}
        aiEnabled={auslassplanungAiEnabled()}
        createStaffAction={createStaffAction}
        updateStaffAction={updateStaffAction}
        deleteStaffAction={deleteStaffAction}
        createShowAction={createShowAction}
        updateShowAction={updateShowAction}
        deleteShowAction={deleteShowAction}
        planShowAction={planShowAction}
        overrideAction={manualOverrideAssignmentAction}
        saveFeedbackAction={saveFeedbackAction}
      />
    </RoleGate>
  );
}
