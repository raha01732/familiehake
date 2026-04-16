// src/app/tools/vault/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import VaultClientPage from "./VaultClientPage";

export const metadata = { title: "Passwort-Safe" };

export default async function VaultPage() {
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/vault"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <VaultClientPage />;
}
