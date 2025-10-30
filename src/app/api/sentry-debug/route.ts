import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// verhindert, dass Next/Vercel die Route beim Build prerendert
export const dynamic = "force-dynamic";
// (optional) sicherstellen, dass sie auf Node läuft
export const runtime = "nodejs";

export async function GET() {
  try {
    // absichtlicher Fehler
    throw new Error("Sentry API test error");
  } catch (err) {
    // nach Sentry melden, aber den Build nicht crashen
    Sentry.captureException(err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
