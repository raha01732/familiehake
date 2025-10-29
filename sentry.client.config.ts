import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  tracesSampleRate: 0.2, // 20% Performance-Sampling (anpassen)
  replaysSessionSampleRate: 0.0, // ggf. aktivieren
  replaysOnErrorSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
});
