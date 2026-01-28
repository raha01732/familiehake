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
      <body className="p-8">
        <div className="card p-6">
          <h2 className="text-zinc-100 text-xl font-semibold mb-2">Es ist ein Fehler aufgetreten</h2>
          <p className="text-zinc-400 text-sm mb-4">Bitte versuche es erneut. Der Fehler wurde protokolliert.</p>
          <button onClick={reset} className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2">
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
