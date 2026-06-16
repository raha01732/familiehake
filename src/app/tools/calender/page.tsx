// /workspace/familiehake/src/app/tools/calender/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import CalendarClientPage from "./CalendarClientPage";

export default async function CalendarPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/calender", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <CalendarClientPage />;
}
