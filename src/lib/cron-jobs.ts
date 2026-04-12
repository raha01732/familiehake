// /workspace/familiehake/src/lib/cron-jobs.ts
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CronRunLogInput = {
  jobName: string;
  request: NextRequest;
  success: boolean;
  skipped?: boolean;
  durationMs?: number;
  details?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

function getRequestActor(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const hasBearer = Boolean(authHeader?.startsWith("Bearer "));
  const userAgent = req.headers.get("user-agent");
  const xVercelCron = req.headers.get("x-vercel-cron");
  const xForwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const trigger = xVercelCron ? "vercel-cron" : hasBearer ? "authorized-manual" : "manual";

  return {
    actor: trigger,
    trigger,
    userAgent,
    sourceIp: xForwardedFor,
  };
}

export async function hasSuccessfulRunToday(jobName: string) {
  const sb = createAdminClient();
  const runDay = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("cron_job_runs")
    .select("id")
    .eq("job_name", jobName)
    .eq("run_day", runDay)
    .eq("success", true)
    .eq("skipped", false)
    .limit(1);

  if (error) {
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

export async function logCronRun(input: CronRunLogInput) {
  try {
    const sb = createAdminClient();
    const now = new Date();
    const actorInfo = getRequestActor(input.request);
    const runDay = now.toISOString().slice(0, 10);

    await sb.from("cron_job_runs").insert({
      job_name: input.jobName,
      run_day: runDay,
      actor: actorInfo.actor,
      trigger: actorInfo.trigger,
      source_ip: actorInfo.sourceIp,
      user_agent: actorInfo.userAgent,
      success: input.success,
      skipped: Boolean(input.skipped),
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      duration_ms: input.durationMs ?? null,
      details: input.details ?? null,
      error_message: input.errorMessage ?? null,
    });
  } catch (error) {
    console.error("[cron] failed to persist cron run log", error);
  }
}
