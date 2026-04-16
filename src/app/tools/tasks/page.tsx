// src/app/tools/tasks/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import TaskBoardClientPage from "./TaskBoardClientPage";

export const metadata = { title: "Aufgaben-Board" };

export default async function TasksPage() {
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/tasks"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <TaskBoardClientPage />;
}
