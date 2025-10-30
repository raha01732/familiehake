import { RoleGate } from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import ActivityFeed from "@/components/ActivityFeed";

export const metadata = { title: "Activity" };

async function getInitial() {
  const sb = createAdminClient();
  const { data } = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);
  return (data ?? []) as any[];
}

export default async function ActivityPage() {
  const initial = await getInitial();
  return (
    <RoleGate routeKey="monitoring">
      <section className="card p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Aktivitäten (live)</h1>
          <p className="text-zinc-400 text-sm">Echtzeit-Feed aus audit_events</p>
        </div>
        <ActivityFeed initial={initial} />
      </section>
    </RoleGate>
  );
}
