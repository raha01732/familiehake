// src/app/api/calender/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toICS } from "@/lib/ics";
import { applyRateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calender:export");
  if (rl instanceof NextResponse) return rl;

  const { userId } = auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data } = await sb
    .from("calendar_events")
    .select("id,title,starts_at,ends_at,location,description")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  const ics = toICS(
    (data ?? []).map((e) => ({
      uid: e.id,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location ?? "",
      description: e.description ?? "",
    }))
  );

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="calendar.ics"',
    },
  });
}
