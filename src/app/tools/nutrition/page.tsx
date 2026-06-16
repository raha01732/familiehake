// src/app/tools/nutrition/page.tsx
import { getSessionInfo } from "@/lib/auth";
import { getToolGate } from "@/lib/workspace-locks";
import ToolMaintenanceNotice from "@/components/ToolMaintenanceNotice";
import NutritionClientPage from "./NutritionClientPage";

export const metadata = { title: "Ernährung & Rezepte" };

export default async function NutritionPage() {
  const session = await getSessionInfo();
  const gate = await getToolGate("tools/nutrition", session);
  if (gate.blocked) {
    return <ToolMaintenanceNotice message={gate.message} />;
  }

  return <NutritionClientPage />;
}
