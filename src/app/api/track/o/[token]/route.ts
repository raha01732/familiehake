// src/app/api/track/o/[token]/route.ts
// Öffnungs-Pixel: liefert ein 1×1-GIF und protokolliert die erste Öffnung.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 1×1 transparentes GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (token) {
    try {
      const sb = createAdminClient();
      await sb
        .from("system_message_recipients")
        .update({ opened_at: new Date().toISOString() })
        .eq("token", token)
        .is("opened_at", null);
    } catch (e) {
      // Tracking darf das Bild nie blockieren.
      console.warn("[track/open] update failed:", e instanceof Error ? e.message : e);
    }
  }
  return pixelResponse();
}
