import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import SettingsPanel from "../SettingsPanel";
import { Settings } from "lucide-react";

export const metadata = { title: "Dienstplaner – Einstellungen" };
export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  const [pauseResult, weekdayResult, trackResult, weekdayPosResult] = await Promise.all([
    sb.from("dienstplan_pause_rules").select("id, min_minutes, pause_minutes").order("min_minutes"),
    sb.from("dienstplan_weekday_requirements").select("weekday, required_shifts").order("weekday"),
    sb.from("dienstplan_shift_tracks").select("track_key, label, start_time, end_time").order("start_time"),
    sb
      .from("dienstplan_weekday_position_requirements")
      .select("id, weekday, track_key, position, note")
      .order("weekday"),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div
          className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
          style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
        >
          <Settings size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--primary))" }}
          >
            Konfiguration
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Einstellungen</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Pausenregeln, Schienen, Wochentag-Anforderungen
          </p>
        </div>
      </div>
      <SettingsPanel
        pauseRules={pauseResult.data ?? []}
        weekdayRequirements={weekdayResult.data ?? []}
        shiftTracks={trackResult.data ?? []}
        weekdayPositionRequirements={weekdayPosResult.data ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
