// src/app/api/track/c/[token]/route.ts
// Klick-Redirect: protokolliert den Klick und leitet zum Ziel weiter.
// Open-Redirect-Schutz: leitet nur zu URLs weiter, die als Button in der
// zugehörigen Nachricht hinterlegt sind.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBlocks } from "@/lib/system-messages/blocks";
import { isHttpUrl } from "@/lib/system-messages/tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function homeUrl(req: NextRequest): URL {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL("/", base || req.url);
  } catch {
    return new URL("/", req.url);
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const target = req.nextUrl.searchParams.get("u") ?? "";

  if (!token || !target || !isHttpUrl(target)) {
    return NextResponse.redirect(homeUrl(req));
  }

  try {
    const sb = createAdminClient();
    const { data: recipient } = await sb
      .from("system_message_recipients")
      .select("id, message_id, clicked_at")
      .eq("token", token)
      .maybeSingle();

    if (!recipient) {
      return NextResponse.redirect(homeUrl(req));
    }

    // Ziel gegen die Buttons der Nachricht prüfen (Open-Redirect-Schutz)
    const { data: message } = await sb
      .from("system_messages")
      .select("blocks")
      .eq("id", (recipient as { message_id: string }).message_id)
      .maybeSingle();

    const allowed = new Set(
      normalizeBlocks((message as { blocks?: unknown } | null)?.blocks)
        .filter((b): b is { type: "button"; label: string; href: string } => b.type === "button")
        .map((b) => b.href.trim())
    );

    if (!allowed.has(target)) {
      return NextResponse.redirect(homeUrl(req));
    }

    if (!(recipient as { clicked_at: string | null }).clicked_at) {
      await sb
        .from("system_message_recipients")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", (recipient as { id: string }).id)
        .is("clicked_at", null);
    }

    return NextResponse.redirect(new URL(target));
  } catch (e) {
    console.warn("[track/click] failed:", e instanceof Error ? e.message : e);
    // Im Zweifel trotzdem zum (validierten) Ziel weiterleiten.
    return NextResponse.redirect(new URL(target));
  }
}
