// src/lib/cron-registry.ts
// Zentrale Liste aller Cron-Jobs: job_name (wie in cron_job_runs geloggt) +
// der Pfad, unter dem der Job erreichbar ist. Wird von der Monitoring-Seite
// (Anzeige) und der Admin-Trigger-Route (manueller Lauf) genutzt, damit beide
// nie auseinanderlaufen.
export type CronJobDescriptor = {
  jobName: string;
  /** Sprechender Anzeigename für die Monitoring-Seite. */
  label: string;
  path: string;
};

export const CRON_JOB_REGISTRY: CronJobDescriptor[] = [
  { jobName: "keepalive", label: "Datenbank wachhalten", path: "/api/keepalive" },
  { jobName: "cache-warmup", label: "Cache vorwärmen", path: "/api/cron/cache-warmup" },
  { jobName: "upstash-heartbeat", label: "Redis-Heartbeat", path: "/api/cron/upstash-heartbeat" },
  { jobName: "audit-rollup", label: "Audit-Log verdichten", path: "/api/cron/audit-rollup" },
  { jobName: "discover-routes", label: "Neue Seiten erkennen", path: "/api/cron/discover-routes" },
  { jobName: "force-logout", label: "Inaktive Sitzungen abmelden", path: "/api/cron/force-logout" },
  { jobName: "shift-reminder", label: "Schicht-Erinnerungen", path: "/api/cron/shift-reminder" },
  { jobName: "clerk-activity-sync", label: "Login-Aktivität synchronisieren", path: "/api/cron/clerk-activity-sync" },
  { jobName: "cleanup-notifications", label: "Benachrichtigungen archivieren", path: "/api/cron/cleanup-notifications" },
  { jobName: "dispatch-system-messages", label: "Geplante Nachrichten versenden", path: "/api/cron/dispatch-system-messages" },
  { jobName: "notify-admins-cron-status", label: "Cron-Statusreport an Admins", path: "/api/cron/notify-admins-cron-status" },
];

export const KNOWN_CRON_JOB_NAMES = CRON_JOB_REGISTRY.map((j) => j.jobName);

export function cronJobLabel(jobName: string): string {
  return CRON_JOB_REGISTRY.find((j) => j.jobName === jobName)?.label ?? jobName;
}
