// src/app/tools/nutrition/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolStatusMap } from "@/lib/tool-status";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import NutritionClientPage from "./NutritionClientPage";

export const metadata = { title: "Ernährung & Rezepte" };

export default async function NutritionPage() {
  const [session, toolStatusMap] = await Promise.all([
    getSessionInfo(),
    getToolStatusMap(),
  ]);
  const toolStatus = toolStatusMap["tools/nutrition"];

  if (toolStatus && !toolStatus.enabled && !session.isSuperAdmin) {
    return <ToolMaintenanceNotice message={toolStatus.maintenanceMessage} />;
  }

  return <NutritionClientPage />;
}
