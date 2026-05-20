// src/app/api/qstash/dispatch/route.ts
// Empfängt QStash-Callbacks zum zeitgenauen Versand einer geplanten
// Systemnachricht. Authentifizierung ausschließlich über QStash-Signatur.
import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/sentry";
import { dispatchSystemMessage } from "@/lib/system-messages/send";
import { verifyQStashSignature } from "@/lib/qstash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rohen Body lesen — wird für die Signaturprüfung im Original benötigt.
  const rawBody = await req.text();
  const signature = req.headers.get("upstash-signature");

  const valid = await verifyQStashSignature({ signature, body: rawBody });
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let id: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { id?: unknown };
    if (typeof parsed.id === "string" && parsed.id) id = parsed.id;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_missing" }, { status: 400 });
  }

  try {
    const result = await dispatchSystemMessage(id);
    if (!result.ok) {
      // 500 -> QStash versucht es gemäß Retry-Policy erneut.
      return NextResponse.json({ ok: false, error: result.error ?? "dispatch_failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      recipientCount: result.recipientCount,
      emailSent: result.emailSent,
      inappSent: result.inappSent,
    });
  } catch (error) {
    reportError(error, { route: "qstash/dispatch", messageId: id });
    return NextResponse.json({ ok: false, error: "dispatch_failed" }, { status: 500 });
  }
}
