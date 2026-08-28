// src/app/tools/portugiesisch/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import PortugiesischClientPage from "./PortugiesischClientPage";

export const metadata = { title: "Portugiesisch" };

export default async function PortugiesischPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/portugiesisch", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <PortugiesischClientPage />;
}
