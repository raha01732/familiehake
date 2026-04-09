// /workspace/familiehake/src/app/tools/calender/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import CalendarClientPage from "./CalendarClientPage";

export default async function CalendarPage() {
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/calender"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <CalendarClientPage />;
}
