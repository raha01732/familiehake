// src/app/tools/dienstplaner/settings/page.tsx
import { redirect } from "next/navigation";

export const metadata = { title: "Dienstplaner Einstellungen" };

export default async function DienstplanerSettingsPage() {
  redirect("/tools/dienstplaner");
}
