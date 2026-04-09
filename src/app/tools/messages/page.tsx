// /workspace/familiehake/src/app/tools/messages/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import MessagesClientPage from "./MessagesClientPage";

export default async function MessagesPage() {
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/messages"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <MessagesClientPage />;
}
