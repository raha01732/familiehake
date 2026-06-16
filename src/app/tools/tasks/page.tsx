// src/app/tools/tasks/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import TaskBoardClientPage from "./TaskBoardClientPage";

export const metadata = { title: "Aufgaben-Board" };

export default async function TasksPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/tasks", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <TaskBoardClientPage />;
}
