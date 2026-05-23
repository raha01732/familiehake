// src/app/api/calendar/feeds/events/route.ts
// Liefert die Termine aller aktiven externen Feeds des Nutzers im
// angefragten Zeitfenster (?from&to, ISO). Feeds werden über Redis
// gecacht; Serien (RRULE) werden im Fenster expandiert.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { decryptCalendar } from "@/lib/calendar-crypto";
import { fetchIcsCached, normalizeFeedUrl } from "@/lib/calendar-feed";
import { parseIcsEvents } from "@/lib/ics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SPAN_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 5_000;

type FeedRow = { id: string; name: string; url_enc: string; color: string };

function parseWindow(req: NextRequest): { from: Date; to: Date } {
  const url = new URL(req.url);
  const now = Date.now();
  const fromRaw = Date.parse(url.searchParams.get("from") ?? "");
  const toRaw = Date.parse(url.searchParams.get("to") ?? "");

  let from = Number.isFinite(fromRaw) ? fromRaw : now - 7 * 24 * 60 * 60 * 1000;
  let to = Number.isFinite(toRaw) ? toRaw : now + 45 * 24 * 60 * 60 * 1000;
  if (to < from) [from, to] = [to, from];
  if (to - from > MAX_SPAN_MS) to = from + MAX_SPAN_MS;

  return { from: new Date(from), to: new Date(to) };
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:calendar:feeds:events");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { from, to } = parseWindow(req);

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("calendar_feeds")
    .select("id,name,url_enc,color")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) {
    console.error("calendar feeds events error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const feeds = (data ?? []) as FeedRow[];
  const events: Array<{
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    description: string | null;
    allDay: boolean;
    readOnly: true;
    color: string;
    feedId: string;
    feedName: string;
  }> = [];

  const syncUpdates: Array<PromiseLike<unknown>> = [];
  const nowIso = new Date().toISOString();

  await Promise.all(
    feeds.map(async (feed) => {
      let url: string | null = null;
      try {
        url = normalizeFeedUrl(decryptCalendar(feed.url_enc, userId));
      } catch {
        url = null;
      }
      if (!url) {
        syncUpdates.push(
          sb.from("calendar_feeds").update({ last_error: "Ungültige URL", last_synced_at: nowIso }).eq("id", feed.id),
        );
        return;
      }

      const result = await fetchIcsCached(url);

      // DB nur bei echtem Netzwerkabruf aktualisieren (begrenzt Schreiblast).
      if (!result.fromCache) {
        syncUpdates.push(
          sb
            .from("calendar_feeds")
            .update({ last_synced_at: nowIso, last_error: result.error })
            .eq("id", feed.id),
        );
      }

      if (!result.ics) return;

      for (const ev of parseIcsEvents(result.ics, from, to)) {
        events.push({
          id: `feed:${feed.id}:${ev.uid}:${ev.starts_at}`,
          title: ev.title,
          starts_at: ev.starts_at,
          ends_at: ev.ends_at,
          location: ev.location,
          description: ev.description,
          allDay: ev.allDay,
          readOnly: true,
          color: feed.color,
          feedId: feed.id,
          feedName: feed.name,
        });
      }
    }),
  );

  if (syncUpdates.length) {
    try {
      await Promise.all(syncUpdates);
    } catch {
      // best effort
    }
  }

  const limited = events.length > MAX_EVENTS ? events.slice(0, MAX_EVENTS) : events;
  return NextResponse.json({ ok: true, data: limited });
}
