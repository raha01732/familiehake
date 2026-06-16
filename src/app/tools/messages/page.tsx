// /workspace/familiehake/src/app/tools/messages/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import MessagesClientPage from "./MessagesClientPage";

export default async function MessagesPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/messages", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <MessagesClientPage />;
}
