import RoleGate from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import ActivityFeed from "@/components/ActivityFeed";
import { BarChart2 } from "lucide-react";

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
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <BarChart2 size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Audit-Log
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Aktivitäten</span>
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Die letzten Systemereignisse aus der Datenbank.
            </p>
          </div>
        </div>

        <ActivityFeed initial={(events ?? []) as any} debug />
      </section>
    </RoleGate>
  );
}
