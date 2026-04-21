// src/app/api/audit/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionInfo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:audit:recent");
  if (rl instanceof NextResponse) return rl;

  const session = await getSessionInfo();
  if (!session.signedIn) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const isAdmin =
    session.isSuperAdmin ||
    session.roles.some((r) => r.rank >= 50 || r.name.toLowerCase() === "admin");

  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const after = req.nextUrl.searchParams.get("after");

  const sb = createAdminClient();
  let query = sb
    .from("audit_events")
    .select("ts, action, actor_email, target, detail")
    .order("ts", { ascending: false })
    .limit(50);

  if (after) {
    query = query.gt("ts", after);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[audit/recent] select error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}
