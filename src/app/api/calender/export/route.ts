// /workspace/familiehake/src/app/api/calender/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toICS } from "@/lib/ics";
import { applyRateLimit } from "@/lib/ratelimit";
import { decryptCalendar } from "@/lib/calendar-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calender:export");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data } = await sb
    .from("calendar_events")
    .select("id,title_enc,starts_at,ends_at,location_enc,description_enc")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  let events;
  try {
    events = (data ?? []).map((e) => ({
      uid: e.id,
      title: decryptCalendar(e.title_enc, userId),
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      location: e.location_enc ? decryptCalendar(e.location_enc, userId) : "",
      description: e.description_enc ? decryptCalendar(e.description_enc, userId) : "",
    }));
  } catch (err) {
    console.error("calender export decrypt error:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "decrypt error" }, { status: 500 });
  }

  const ics = toICS(events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="calendar.ics"',
    },
  });
}
