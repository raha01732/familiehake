// src/app/dashboard/page.tsx
import HomePageContent from "@/components/home/HomePageContent";

export const metadata = { title: "Dashboard | Private Tools" };

export default async function DashboardPage() {
  return <HomePageContent auditTarget="/dashboard" />;
}
