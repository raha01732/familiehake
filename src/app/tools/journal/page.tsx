// /workspace/familiehake/src/app/tools/journal/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import JournalClientPage from "./JournalClientPage";

export default async function JournalPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/journal", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <JournalClientPage />;
}
