// /workspace/familiehake/src/components/AdminErrorBanner.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_ENTRIES = 20;
const STORAGE_KEY = "admin-error-log";

const formatValue = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
};

type LoggedError = {
  id: string;
  message: string;
  stack?: string | null;
  source: string;
  severity: "error" | "critical";
  timestamp: string;
};

type AdminErrorBannerProps = {
  isAdmin: boolean;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AdminErrorBanner({ isAdmin }: AdminErrorBannerProps) {
  const [errors, setErrors] = useState<LoggedError[]>([]);
  const [expanded, setExpanded] = useState(false);
  const lastSignatureRef = useRef<string | null>(null);
  const lastTimestampRef = useRef<number>(0);

  const reportCritical = useCallback(async (entry: LoggedError) => {
    Sentry.captureException(new Error(entry.message));
    try {
      await fetch("/api/errors/critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: entry.message,
          stack: entry.stack,
          source: entry.source,
          severity: entry.severity,
          url: typeof window !== "undefined" ? window.location.href : null,
          timestamp: entry.timestamp,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
    } catch {
      // ignore
    }
  }, []);

  const recordError = useCallback(
    (entry: LoggedError) => {
      const signature = `${entry.severity}:${entry.source}:${entry.message}`;
      const now = Date.now();
      if (lastSignatureRef.current === signature && now - lastTimestampRef.current < 500) {
        return;
      }
      lastSignatureRef.current = signature;
      lastTimestampRef.current = now;
      setErrors((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
      if (entry.severity === "critical") {
        void reportCritical(entry);
      }
    },
    [reportCritical]
  );

  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (!isAdmin) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LoggedError[];
        if (Array.isArray(parsed)) {
          setErrors(parsed.slice(0, MAX_ENTRIES));
        }
      } catch {
        // ignore
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(errors));
  }, [errors, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const handleError = (event: ErrorEvent) => {
      const details = formatValue(event.error ?? event.message);
      recordError({
        id: createId(),
        message: details.message || "Unbekannter Fehler",
        stack: details.stack ?? null,
        source: event.filename || "window.error",
        severity: "critical",
        timestamp: new Date().toISOString(),
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const details = formatValue(event.reason);
      recordError({
        id: createId(),
        message: details.message || "Unbehandeltes Promise-Rejection",
        stack: details.stack ?? null,
        source: "unhandledrejection",
        severity: "critical",
        timestamp: new Date().toISOString(),
      });
    };

    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError(...args);
      const message = args.map((arg) => formatValue(arg).message).filter(Boolean).join(" ");
      recordError({
        id: createId(),
        message: message || "console.error",
        stack: args.find((arg) => arg instanceof Error)?.stack ?? null,
        source: "console.error",
        severity: "error",
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      console.error = originalConsoleError;
    };
  }, [isAdmin, recordError]);

  const renderedErrors = useMemo(
    () =>
      errors.map((entry) => (
        <li key={entry.id} className="border-b border-red-500/30 py-2 last:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-red-200">{entry.severity}</span>
            <span className="text-xs text-red-300">{new Date(entry.timestamp).toLocaleString("de-DE")}</span>
          </div>
          <p className="mt-1 text-sm text-red-100">{entry.message}</p>
          {entry.stack ? <pre className="mt-2 whitespace-pre-wrap text-xs text-red-200/80">{entry.stack}</pre> : null}
          <p className="mt-1 text-xs text-red-300">Quelle: {entry.source}</p>
        </li>
      )),
    [errors]
  );

  if (!isAdmin || !hasErrors) return null;

  return (
    <div className="sticky top-0 z-[600] w-full border-b border-red-500/40 bg-red-950/90 px-4 py-3 text-red-50 shadow-lg shadow-red-950/30 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Admin-Fehlerprotokoll</p>
            <p className="text-xs text-red-200">
              {errors.length} Fehler in dieser Sitzung {expanded ? "sichtbar" : "vorhanden"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-full border border-red-300/60 px-3 py-1 text-xs text-red-100 hover:border-red-200 hover:text-red-50"
            >
              {expanded ? "Details ausblenden" : "Details anzeigen"}
            </button>
            <button
              type="button"
              onClick={() => setErrors([])}
              className="rounded-full border border-red-300/60 px-3 py-1 text-xs text-red-100 hover:border-red-200 hover:text-red-50"
            >
              Liste leeren
            </button>
          </div>
        </div>
        {expanded ? (
          <ul className="divide-y divide-red-500/30 rounded-lg border border-red-500/40 bg-red-950/60 px-3">
            {renderedErrors}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
