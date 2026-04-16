// src/app/tools/finance/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import FinanceClientPage from "./FinanceClientPage";

export const metadata = { title: "Mein Budget" };

export default async function FinancePage() {
  const [session, toolStatusMap] = await Promise.all([getSessionInfo(), getToolStatusMap()]);
  const toolStatus = toolStatusMap["tools/finance"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <FinanceClientPage />;
}
