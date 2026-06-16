// src/app/tools/vault/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import VaultClientPage from "./VaultClientPage";

export const metadata = { title: "Passwort-Safe" };

export default async function VaultPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/vault", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <VaultClientPage />;
}
