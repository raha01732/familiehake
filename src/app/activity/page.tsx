import RoleGate from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import ActivityFeed from "@/components/ActivityFeed";

export const metadata = { title: "Aktivitäten" };

export default async function ActivityPage() {
  const sb = createAdminClient();

  const { data: events } = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);

  return (
    <RoleGate routeKey="activity">
      <section className="p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
          Aktivitäten
        </h1>
        <p className="text-sm text-zinc-400">
          Die letzten Systemereignisse aus der Datenbank.
        </p>

        <ActivityFeed events={events ?? []} />
      </section>
    </RoleGate>
  );
}
