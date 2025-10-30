import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
  // Performance
  tracesSampleRate: 0.2,          // 20% Frontend-Transaktionen
  profilesSampleRate: 0.0,        // ggf. aktivieren
  // Browser-Konsole -> Sentry
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ["error"] })
  ],
  // Replays (optional)
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.1,
});
