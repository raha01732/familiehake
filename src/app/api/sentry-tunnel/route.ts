import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // wichtig: nicht edge

export async function POST(req: NextRequest) {
  try {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return NextResponse.json({ error: "Missing DSN" }, { status: 500 });

    const u = new URL(dsn);
    const projectId = u.pathname.replace("/", "");
    const upstream = `https://${u.host}/api/${projectId}/envelope/`;

    const body = await req.arrayBuffer();

    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
      },
      body,
    });

    return new NextResponse(null, { status: res.status });
  } catch (e) {
    console.error("[SENTRY_TUNNEL] error", e);
    return NextResponse.json({ error: "Tunnel failure" }, { status: 500 });
  }
}
