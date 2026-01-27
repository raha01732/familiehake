// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import posthog from 'posthog-js';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tunnel: "/api/sentry-tunnel",

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "system",
      triggerLabel: "Einen Fehler melden",
      formTitle: "Einen Fehler melden",
      submitButtonLabel: "Fehlermeldung senden",
      cancelButtonLabel: "Abbrechen",
      confirmButtonLabel: "Bestätigen",
      addScreenshotButtonLabel: "Einen Screenshot anfügen",
      removeScreenshotButtonLabel: "Screenshot entfernen",
      namePlaceholder: "Dein Name",
      emailLabel: "E-mail",
      messageLabel: "Beschreibung",
      messagePlaceholder: "Welcher Fehler ist aufgetreten? Was hast du erwartet?",
      successMessageText: "Danke für deine Meldung!",
      highlightToolText: "Hervorheben",
      hideToolText: "Schwärzen",
      removeHighlightText: "Entfernen",
    }),
  
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: '2025-11-30'
})
