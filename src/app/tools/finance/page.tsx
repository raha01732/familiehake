// src/app/tools/finance/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import FinanceClientPage from "./FinanceClientPage";

export const metadata = { title: "Mein Budget" };

export default async function FinancePage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/finance", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <FinanceClientPage />;
}
