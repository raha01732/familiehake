// src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1, // anpassen
    integrations: (integrations) => integrations,
  });
}

