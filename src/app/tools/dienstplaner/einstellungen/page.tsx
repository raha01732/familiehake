import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { getClerkUserCached, getPrimaryEmail } from "@/lib/clerk-cache";
import { formatUserDisplayName } from "@/lib/user-display";
import { getDienstplanEditorIds } from "@/lib/dienstplaner/availability-guard";
import { setDienstplanEditorAction } from "../actions";
import SettingsPanel from "../SettingsPanel";
import { Settings } from "lucide-react";
import { loadPlanningRules } from "@/lib/dienstplaner/planning-rules";
import type { ShiftRule } from "../requirements";
import type { EditableUser } from "../SettingsPanel";

export const metadata = { title: "Dienstplaner – Einstellungen" };
export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;

  const sb = createAdminClient();
  const planningRules = await loadPlanningRules(sb);
  const [pauseResult, rulesResult, hourDefaultsResult, cinemaRoleResult] =
    await Promise.all([
      sb.from("dienstplan_pause_rules").select("id, min_minutes, pause_minutes").order("min_minutes"),
      sb
        .from("dienstplan_shift_rules")
        .select("id, position, require_leader, start_time, end_time, weekdays, required_count, note")
        .order("start_time")
        .order("id"),
      sb
        .from("dienstplan_employment_hour_defaults")
        .select("employment_type, vacation_hours_per_day"),
      sb.from("user_roles").select("user_id, roles(name)"),
    ]);

  const shiftRules = ((rulesResult.data ?? []) as ShiftRule[]).map((rule) => ({
    ...rule,
    weekdays: (rule.weekdays ?? []).map(Number),
  }));

  // Nutzer des Kino-Bereichs (Zugriff auf den Dienstplaner) ohne Admin-Rolle —
  // für diese kann hier die Bearbeitung von Verfügbarkeiten freigeschaltet werden.
  let editableUsers: EditableUser[] = [];
  if (isAdmin) {
    const cinemaUserIds = [
      ...new Set(
        ((cinemaRoleResult.data ?? []) as { user_id: string; roles: { name: string } | { name: string }[] | null }[])
          .filter((row) => {
            const roleNames = Array.isArray(row.roles) ? row.roles.map((r) => r.name) : [row.roles?.name];
            return roleNames.includes("cinema");
          })
          .map((row) => row.user_id)
      ),
    ];
    const editorIds = await getDienstplanEditorIds();
    const profiles = await Promise.all(cinemaUserIds.map((id) => getClerkUserCached(id)));
    editableUsers = cinemaUserIds
      .map((id, i) => {
        const profile = profiles[i];
        const profileRole = getRoleFromPublicMetadata(profile?.publicMetadata);
        if (profileRole === "admin" || id === env().PRIMARY_SUPERADMIN_ID) return null;
        return {
          id,
          displayName: profile
            ? formatUserDisplayName({
                id,
                firstName: profile.firstName,
                lastName: profile.lastName,
                username: profile.username,
                emailAddresses: getPrimaryEmail(profile) ? [{ emailAddress: getPrimaryEmail(profile)! }] : null,
              })
            : id,
          isEditor: editorIds.has(id),
        };
      })
      .filter((u): u is EditableUser => u !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  }

  const rulesMissing = Boolean(rulesResult.error);

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
            Pausenregeln, Planungsregeln, Schichtanforderungen, Wochentag-Bedarf
          </p>
        </div>
      </div>
      {rulesMissing && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
          Die Schichtregeln sind noch nicht eingerichtet. Bitte <code>dienstplaner-shift-rules-migration.sql</code> in
          Supabase ausführen – danach erscheinen hier deine bisherigen Anforderungen als Regeln.
        </div>
      )}
      <SettingsPanel
        pauseRules={pauseResult.data ?? []}
        shiftRules={shiftRules}
        employmentHourDefaults={hourDefaultsResult.data ?? []}
        planningRules={planningRules}
        editableUsers={editableUsers}
        setDienstplanEditorAction={setDienstplanEditorAction}
        isAdmin={isAdmin}
      />
    </div>
  );
}
