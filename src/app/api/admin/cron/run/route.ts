// src/app/api/admin/cron/run/route.ts
// Manueller Trigger für einen bekannten Cron-Job, ausgelöst von der
// Monitoring-Seite (nur Admin/Superadmin). Ruft server-seitig den echten
// Cron-Endpunkt mit CRON_SECRET auf - exakt dieselbe Logik (Auth,
// Daily-Claim-Dedup, Logging in cron_job_runs) wie ein regulärer Lauf,
// nur eben von Hand angestoßen statt von Vercel Cron.
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSessionInfo } from "@/lib/auth";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { CRON_JOB_REGISTRY } from "@/lib/cron-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:admin:cron:run");
  if (rl instanceof NextResponse) return rl;

  const session = await getSessionInfo();
  const isAdmin =
    session.signedIn && (session.isSuperAdmin || session.roles.some((r) => r.name === "admin"));
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { jobName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const job = CRON_JOB_REGISTRY.find((j) => j.jobName === body.jobName);
  if (!job) {
    return NextResponse.json({ ok: false, error: "unknown job" }, { status: 400 });
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) {
    return NextResponse.json({ ok: false, error: "no host" }, { status: 500 });
  }

  const secret = process.env.CRON_SECRET;
  let status: number;
  let result: unknown;
  try {
    const res = await fetch(`${proto}://${host}${job.path}`, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      cache: "no-store",
    });
    status = res.status;
    result = await res.json().catch(() => null);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "request failed" },
      { status: 502 },
    );
  }

  await logAudit({
    action: "cron_manual_trigger",
    actorUserId: session.userId,
    actorEmail: session.email,
    target: `cron:${job.jobName}`,
    detail: { status, result },
  });

  return NextResponse.json({ ok: status >= 200 && status < 300, status, result });
}
