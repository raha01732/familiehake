// src/instrumentation-client.ts
"use client";

import * as Sentry from "@sentry/nextjs";

export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,           // anpassen
    replaysSessionSampleRate: 0.0,   // ggf. aktivieren
    replaysOnErrorSampleRate: 1.0,
    integrations: (integrations) => integrations,
  });
}
