import RoleGate from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import ActivityFeed from "@/components/ActivityFeed";

export const metadata = { title: "Aktivitäten" };

export default async function ActivityPage() {
  const sb = createAdminClient();

  // Wichtig: Fehler nicht verschlucken
  const res = await sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);

  // ===================== MINI-DEBUG START =====================
  // Wenn es "kurz angezeigt, dann weg" gibt: checke Client-Konsole UND Server-Logs.
  // Server-Logs: diese Zeilen hier.
  console.log("[ACTIVITY MINI-DEBUG] audit_events error:", res.error);
  console.log("[ACTIVITY MINI-DEBUG] audit_events count:", res.data?.length ?? 0);
  // ===================== MINI-DEBUG END =====================

  if (res.error) {
    // So bekommst du eine saubere, sichtbare Fehlermeldung statt stillem Client-Crash
    throw new Error(`audit_events_select_failed: ${res.error.message}`);
  }

  const events = (res.data ?? []).map((e: any) => ({
    ...e,
    // Stabilisiert Hydration: ts immer string
    ts: typeof e.ts === "string" ? e.ts : new Date(e.ts).toISOString(),
  }));

  return (
    <RoleGate routeKey="activity">
      <section className="p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Aktivitäten</h1>
        <p className="text-sm text-zinc-400">Die letzten Systemereignisse aus der Datenbank.</p>

        <ActivityFeed initial={(events ?? []) as any} debug />
      </section>
    </RoleGate>
  );
}
