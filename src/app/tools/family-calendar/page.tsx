// src/app/tools/family-calendar/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import FamilyCalendarClientPage from "./FamilyCalendarClientPage";

export const metadata = { title: "Geteilter Kalender" };

export default async function FamilyCalendarPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/family-calendar", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <FamilyCalendarClientPage />;
}
