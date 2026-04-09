// /workspace/familiehake/src/app/error.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { trackException } from "@/lib/posthog-client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
    trackException(error, {
      source: "route-error",
      severity: "critical",
      url: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      digest: error.digest,
    });
    const report = async () => {
      try {
        await fetch("/api/errors/critical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: error.message,
            stack: error.stack ?? null,
            source: "route-error",
            severity: "critical",
            url: typeof window !== "undefined" ? window.location.href : null,
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          }),
        });
      } catch {
        // ignore
      }
    };
    void report();
  }, [error]);
  return (
    <html>
      <body className="bg-[hsl(var(--background))] p-8">
        <div className="card max-w-2xl p-8">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Es ist ein Fehler aufgetreten</h2>
          <p className="mb-4 text-sm text-slate-700">Bitte versuche es erneut. Der Fehler wurde protokolliert.</p>
          <button
            onClick={reset}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
