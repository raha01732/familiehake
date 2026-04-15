import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import SettingsPanel from "../SettingsPanel";

export const metadata = { title: "Dienstplaner – Einstellungen" };
export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  const [
    empResult,
    pauseResult,
    weekdayResult,
    trackResult,
    weekdayPosResult,
  ] = await Promise.all([
    sb
      .from("dienstplan_employees")
      .select("id, name, position, monthly_hours, weekly_hours, user_id")
      .order("sort_order")
      .order("id"),
    sb.from("dienstplan_pause_rules").select("id, min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_weekday_requirements").select("weekday, required_shifts").order("weekday"),
    sb.from("dienstplan_shift_tracks").select("track_key, label, start_time, end_time").order("start_time"),
    sb
      .from("dienstplan_weekday_position_requirements")
      .select("id, weekday, track_key, position, note")
      .order("weekday"),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Einstellungen</h1>
        <p className="text-sm text-zinc-500 mt-1">Pausenregeln, Schienen, Wochentag-Anforderungen</p>
      </div>
      <SettingsPanel
        employees={empResult.data ?? []}
        pauseRules={pauseResult.data ?? []}
        weekdayRequirements={weekdayResult.data ?? []}
        shiftTracks={trackResult.data ?? []}
        weekdayPositionRequirements={weekdayPosResult.data ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
