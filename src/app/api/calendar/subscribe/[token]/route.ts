// src/app/api/calendar/subscribe/[token]/route.ts
// Öffentlicher, token-gesicherter ICS-Feed: liefert die eigenen Termine
// des Token-Inhabers als abonnierbaren Kalender (text/calendar). Wird von
// externen Kalender-Apps periodisch abgerufen – ohne Login, nur per Token.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { decryptCalendar } from "@/lib/calendar-crypto";
import { toICS } from "@/lib/ics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:calendar:subscribe");
  if (rl instanceof NextResponse) return rl;

  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return new NextResponse("Not found", { status: 404 });
  }

  const sb = createAdminClient();
  const { data: tokenRow } = await sb
    .from("calendar_share_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) return new NextResponse("Not found", { status: 404 });

  const userId = tokenRow.user_id as string;

  const { data, error } = await sb
    .from("calendar_events")
    .select("id,title_enc,starts_at,ends_at,location_enc,description_enc")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("calendar subscribe error:", error.message);
    return new NextResponse("error", { status: 500 });
  }

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
    console.error("calendar subscribe decrypt error:", (err as Error).message);
    return new NextResponse("error", { status: 500 });
  }

  const ics = toICS(events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="familyhake.ics"',
      // Aktuell halten; Widerruf wirkt sofort.
      "Cache-Control": "no-store",
    },
  });
}
