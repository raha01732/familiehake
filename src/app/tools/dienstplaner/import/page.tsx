import { currentUser } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import { schedulePdfImportEnabled } from "@/lib/dienstplaner/schedule-pdf";
import {
  computeHistoryInsights,
  type HistoryInsights,
  type HistoryShift,
} from "@/lib/dienstplaner/history-insights";
import type { ImportRecord } from "@/lib/dienstplaner/import-types";
import ImportClient from "./ImportClient";
import {
  confirmScheduleImportAction,
  confirmAvailabilityImportAction,
  discardImportAction,
  applyHistoryWeekdayHeadcountAction,
} from "../import-actions";

export const metadata = { title: "Dienstplaner – Import" };
export const dynamic = "force-dynamic";

export default async function DienstplanerImportPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/dienstplaner", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  const user = await currentUser();
  const role = user ? getRoleFromPublicMetadata(user.publicMetadata) : null;
  const isAdmin = role === "admin" || user?.id === env().PRIMARY_SUPERADMIN_ID;
  if (!isAdmin) {
    return (
      <ToolMaintenanceNotice message="Der Import ist Administratoren vorbehalten." />
    );
  }

  const sb = createAdminClient();
  const [employeesResult, importsResult, historyResult] = await Promise.all([
    sb.from("dienstplan_employees").select("id, name").eq("is_active", true).order("name"),
    sb
      .from("dienstplan_imports")
      .select(
        "id, kind, file_name, status, period_start, period_end, parse_notes, error_message, row_count, confirmed_count, created_at, confirmed_at"
      )
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("dienstplan_history_shifts")
      .select("shift_date, employee_name, employee_id, position, start_time, end_time")
      .order("shift_date", { ascending: false })
      .limit(6000),
  ]);

  const employees = (employeesResult.data ?? []) as { id: number; name: string }[];
  const recentImports = (importsResult.data ?? []) as ImportRecord[];
  const historyRows = (historyResult.data ?? []) as HistoryShift[];
  const insights: HistoryInsights = computeHistoryInsights(historyRows);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 animate-fade-up">
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Import &amp; Analyse</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Alte Dienstpläne (PDF) als Analysebasis einlesen und Verfügbarkeiten aus Excel
            übernehmen. Jeder Import wird vor dem Speichern zur Kontrolle angezeigt.
          </p>
        </div>
      </div>

      <ImportClient
        employees={employees}
        recentImports={recentImports}
        insights={insights}
        pdfEnabled={schedulePdfImportEnabled()}
        confirmScheduleImportAction={confirmScheduleImportAction}
        confirmAvailabilityImportAction={confirmAvailabilityImportAction}
        discardImportAction={discardImportAction}
        applyHistoryWeekdayHeadcountAction={applyHistoryWeekdayHeadcountAction}
      />
    </div>
  );
}
