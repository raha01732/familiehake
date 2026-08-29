// src/lib/cron-registry.ts
// Zentrale Liste aller Cron-Jobs: job_name (wie in cron_job_runs geloggt) +
// der Pfad, unter dem der Job erreichbar ist. Wird von der Monitoring-Seite
// (Anzeige) und der Admin-Trigger-Route (manueller Lauf) genutzt, damit beide
// nie auseinanderlaufen.
export type CronJobDescriptor = {
  jobName: string;
  path: string;
};

export const CRON_JOB_REGISTRY: CronJobDescriptor[] = [
  { jobName: "keepalive", path: "/api/keepalive" },
  { jobName: "cache-warmup", path: "/api/cron/cache-warmup" },
  { jobName: "upstash-heartbeat", path: "/api/cron/upstash-heartbeat" },
  { jobName: "audit-rollup", path: "/api/cron/audit-rollup" },
  { jobName: "discover-routes", path: "/api/cron/discover-routes" },
  { jobName: "force-logout", path: "/api/cron/force-logout" },
  { jobName: "shift-reminder", path: "/api/cron/shift-reminder" },
  { jobName: "clerk-activity-sync", path: "/api/cron/clerk-activity-sync" },
  { jobName: "cleanup-notifications", path: "/api/cron/cleanup-notifications" },
  { jobName: "dispatch-system-messages", path: "/api/cron/dispatch-system-messages" },
  { jobName: "notify-admins-cron-status", path: "/api/cron/notify-admins-cron-status" },
];

export const KNOWN_CRON_JOB_NAMES = CRON_JOB_REGISTRY.map((j) => j.jobName);
