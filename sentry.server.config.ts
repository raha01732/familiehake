import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
  tracesSampleRate: 0.2,          // Server-Performance
  profilesSampleRate: 0.0,        // optional
  // Wichtig: automatisch unhandled Exceptions & Rejections erfassen
});
